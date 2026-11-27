//! The Membership routing outbox (ADR-0005, NEM-133).
//!
//! Membership authority stays on the Controller; Convex holds only a routing
//! projection, which it uses to decide which Accounts, and which of their
//! Access Clients, may post Relay envelopes for this Home. Every change to
//! whether an Account holds an active Membership lands in
//! `membership_routing_outbox` from a trigger on `members`, and every Access
//! Client paired or revoked under an active Membership from a trigger on
//! `access_clients`, in the same transaction as the change. That covers
//! pairing, accepting an Invitation, revoking an Access Client, removing a
//! Member, Leaving a Home and anything else that writes those tables. An
//! active projection names the Membership's Access Clients as they are when
//! it is signed, so a later row never names fewer than are current.
//!
//! [`publish_pending`] signs each row with the Controller's Ed25519 identity
//! key ([`crate::relay_crypto::projection`]) under the current identity epoch
//! and hands it to a [`ProjectionSink`], in sequence order, marking it
//! published only once the sink acknowledges it. A failure stops the batch,
//! and the [`spawn_publisher`] loop retries with backoff, so publishing
//! retries until it succeeds.
//!
//! When the identity epoch changes (a restored Home), or the first time a
//! Controller runs this code (alpha Memberships that predate the outbox),
//! [`publish_pending`] first enqueues an `active` row for every active
//! Membership, so Convex and the Access Clients learn the new epoch.

use std::future::Future;
use std::time::Duration;

use diesel::prelude::*;
use serde::Deserialize;
use serde_json::json;
use tracing::{info, warn};
use uuid::Uuid;

use crate::db::schema::{access_clients, members, membership_routing_outbox as outbox};
use crate::identity::{get_string, set_string};
use crate::relay::handler::{IDENTITY_EPOCH_SETTING, INITIAL_IDENTITY_EPOCH};
use crate::relay_crypto::projection::{
    MAX_ROUTED_ACCESS_CLIENTS, MembershipProjection, MembershipRoutingState,
    SignedMembershipProjection, sign_projection,
};
use crate::state::AppState;

/// The identity epoch whose full set of active Memberships is already in
/// the outbox.
pub const ROUTING_EPOCH_SETTING: &str = "membership_routing_epoch";

const PUBLISH_BATCH: i64 = 32;
const IDLE_POLL: Duration = Duration::from_secs(3);
const MIN_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(60);

/// How the sink took a projection. Both count as acknowledged.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishOutcome {
    /// It is now the latest projection for its Membership.
    Stored,
    /// The sink already holds a newer one, so this change is superseded.
    Stale,
}

/// Where signed projections go: Convex in production, a fake in tests.
pub trait ProjectionSink {
    fn publish(
        &self,
        signed: &SignedMembershipProjection,
    ) -> impl Future<Output = Result<PublishOutcome, String>> + Send;
}

#[derive(Debug, Queryable)]
struct PendingRow {
    sequence: i64,
    membership_id: Uuid,
    account_id: String,
    state: String,
}

#[derive(Debug)]
struct PendingChange {
    row: PendingRow,
    /// The Membership's Access Clients now, newest first up to
    /// [`MAX_ROUTED_ACCESS_CLIENTS`], sorted by ID. Empty when ended.
    access_client_ids: Vec<String>,
}

fn routed_access_clients_on(
    conn: &mut PgConnection,
    membership_id: Uuid,
) -> Result<Vec<String>, String> {
    let ids: Vec<Uuid> = access_clients::table
        .filter(access_clients::member_id.eq(membership_id))
        .order(access_clients::created_at.desc())
        .limit(i64::try_from(MAX_ROUTED_ACCESS_CLIENTS).unwrap_or(i64::MAX))
        .select(access_clients::id)
        .load(conn)
        .map_err(|e| format!("routing Access Client read failed: {e}"))?;
    let mut ids: Vec<String> = ids.into_iter().map(|id| id.to_string()).collect();
    ids.sort();
    Ok(ids)
}

fn identity_epoch_on(conn: &mut PgConnection) -> Result<u64, String> {
    Ok(get_string(conn, IDENTITY_EPOCH_SETTING)?
        .and_then(|value| value.parse().ok())
        .unwrap_or(INITIAL_IDENTITY_EPOCH))
}

/// Enqueues every active Membership when the outbox has not covered the
/// current identity epoch yet. Returns the epoch and how many rows it added.
fn reconcile_epoch_on(conn: &mut PgConnection) -> Result<(u64, usize), String> {
    conn.transaction(|conn| -> Result<(u64, usize), anyhow::Error> {
        let epoch = identity_epoch_on(conn).map_err(anyhow::Error::msg)?;
        let routed = get_string(conn, ROUTING_EPOCH_SETTING)
            .map_err(anyhow::Error::msg)?
            .and_then(|value| value.parse::<u64>().ok());
        if routed == Some(epoch) {
            return Ok((epoch, 0));
        }
        let active: Vec<(Uuid, Option<String>)> = members::table
            .filter(members::status.eq("active"))
            .filter(members::user_id.is_not_null())
            .order(members::created_at.asc())
            .select((members::id, members::user_id))
            .load(conn)?;
        let rows: Vec<_> = active
            .into_iter()
            .filter_map(|(id, account)| {
                account.map(|account| {
                    (
                        outbox::membership_id.eq(id),
                        outbox::account_id.eq(account),
                        outbox::state.eq("active"),
                    )
                })
            })
            .collect();
        let added = diesel::insert_into(outbox::table)
            .values(&rows)
            .execute(conn)?;
        set_string(conn, ROUTING_EPOCH_SETTING, &epoch.to_string()).map_err(anyhow::Error::msg)?;
        Ok((epoch, added))
    })
    .map_err(|error| format!("routing outbox reconcile failed: {error}"))
}

async fn pending_changes(state: &AppState) -> Result<(u64, Vec<PendingChange>), String> {
    let conn = state
        .db
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        let (epoch, added) = reconcile_epoch_on(conn)?;
        if added > 0 {
            info!(
                identity_epoch = epoch,
                memberships = added,
                "enqueued Membership routing projections for the identity epoch"
            );
        }
        let pending = outbox::table
            .filter(outbox::published_at.is_null())
            .order(outbox::sequence.asc())
            .limit(PUBLISH_BATCH)
            .select((
                outbox::sequence,
                outbox::membership_id,
                outbox::account_id,
                outbox::state,
            ))
            .load::<PendingRow>(conn)
            .map_err(|e| format!("routing outbox read failed: {e}"))?;
        let pending = pending
            .into_iter()
            .map(|row| {
                let access_client_ids = if row.state == "active" {
                    routed_access_clients_on(conn, row.membership_id)?
                } else {
                    Vec::new()
                };
                Ok(PendingChange {
                    row,
                    access_client_ids,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        Ok((epoch, pending))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

async fn mark_published(state: &AppState, sequence: i64) -> Result<(), String> {
    let conn = state
        .db
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(move |conn| {
        diesel::update(outbox::table.find(sequence))
            .set(outbox::published_at.eq(diesel::dsl::now))
            .execute(conn)
            .map(|_| ())
            .map_err(|e| format!("routing outbox write failed: {e}"))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

fn routing_state(state: &str) -> Option<MembershipRoutingState> {
    match state {
        "active" => Some(MembershipRoutingState::Active),
        "ended" => Some(MembershipRoutingState::Ended),
        _ => None,
    }
}

/// Signs and publishes up to one batch of pending changes, oldest first.
/// Returns how many the sink acknowledged; stops at the first failure, which
/// leaves that change and every later one pending.
pub async fn publish_pending(
    state: &AppState,
    sink: &impl ProjectionSink,
) -> Result<usize, String> {
    let (epoch, pending) = pending_changes(state).await?;
    let mut published = 0;
    for PendingChange {
        row: change,
        access_client_ids,
    } in pending
    {
        let signed = routing_state(&change.state).ok_or(()).and_then(|routing| {
            sign_projection(
                MembershipProjection {
                    controller_id: state.identity.controller_id.clone(),
                    identity_epoch: epoch,
                    membership_id: change.membership_id.to_string(),
                    account_id: change.account_id.clone(),
                    state: routing,
                    sequence: u64::try_from(change.sequence).unwrap_or(0),
                    access_client_ids,
                },
                &state.identity.keypair.signing_key,
            )
            .map_err(|_| ())
        });
        match signed {
            Ok(signed) => {
                sink.publish(&signed).await?;
            }
            Err(()) => {
                // Nothing can ever publish it, so it must not block the rest.
                warn!(
                    sequence = change.sequence,
                    "skipping a Membership routing change that cannot be projected"
                );
            }
        }
        mark_published(state, change.sequence).await?;
        published += 1;
    }
    Ok(published)
}

/// Publishes to Convex over HTTP (`POST /membership/publish`), authenticated
/// like the Relay HTTP fallback. Convex checks the signature against the
/// Controller public key it registered.
pub struct HttpSink {
    client: reqwest::Client,
    url: String,
    registration_secret: Option<String>,
}

impl HttpSink {
    pub fn new(site_url: &str, registration_secret: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            url: format!("{}/membership/publish", site_url.trim_end_matches('/')),
            registration_secret,
        }
    }
}

#[derive(Deserialize)]
struct PublishReply {
    outcome: PublishOutcome,
}

impl ProjectionSink for HttpSink {
    async fn publish(&self, signed: &SignedMembershipProjection) -> Result<PublishOutcome, String> {
        let response = self
            .client
            .post(&self.url)
            .json(&json!({
                "registrationSecret": self.registration_secret,
                "signed": signed,
            }))
            .send()
            .await
            .map_err(|e| format!("publish request failed: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("publish failed ({status})"));
        }
        response
            .json::<PublishReply>()
            .await
            .map(|reply| reply.outcome)
            .map_err(|_| "publish reply unreadable".to_string())
    }
}

/// Drains the outbox for as long as Core runs: immediately while there is
/// work, every few seconds when idle, and with exponential backoff while
/// publishing fails.
pub fn spawn_publisher(state: AppState, sink: impl ProjectionSink + Send + Sync + 'static) {
    tokio::spawn(async move {
        let mut backoff = MIN_BACKOFF;
        loop {
            match publish_pending(&state, &sink).await {
                Ok(0) => {
                    backoff = MIN_BACKOFF;
                    tokio::time::sleep(IDLE_POLL).await;
                }
                Ok(published) => {
                    backoff = MIN_BACKOFF;
                    info!(published, "published Membership routing changes");
                }
                Err(error) => {
                    warn!(%error, "Membership routing publish failed; retrying");
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(MAX_BACKOFF);
                }
            }
        }
    });
}
