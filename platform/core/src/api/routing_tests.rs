//! Seam 2 (NEM-133): the Membership routing outbox, driven through Core's
//! HTTP router in-process. Pairing, accepting an Invitation, removing a
//! Member and Leaving a Home each publish a signed Membership routing
//! projection to a fake Convex, which checks every signature against the
//! Controller's public key and keeps the latest projection per Membership,
//! as the real one does.
//!
//! These tests need the isolated test PostgreSQL
//! (`CAPABILITY_TEST_DATABASE_URL`), as the other database tests do.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::http::StatusCode;
use diesel::prelude::*;

use super::local_access_tests::{CONTROLLER_ID, Home, identity_body, open_session, pair};
use crate::db::schema::settings;
use crate::pairing::routing::{
    ProjectionSink, PublishOutcome, ROUTING_EPOCH_SETTING, publish_pending,
};
use crate::relay::handler::IDENTITY_EPOCH_SETTING;
use crate::relay_crypto::projection::{
    MembershipProjection, MembershipRoutingState, SignedMembershipProjection, verify_projection,
};

/// Convex's side, faked: verifies, then keeps the latest per Membership.
struct FakeConvex {
    controller_key: [u8; 32],
    latest: Mutex<HashMap<String, MembershipProjection>>,
    received: Mutex<Vec<MembershipProjection>>,
    failures_left: AtomicUsize,
}

impl FakeConvex {
    fn for_home(home: &Home) -> Self {
        Self {
            controller_key: home
                .state
                .identity
                .keypair
                .signing_key
                .verifying_key()
                .to_bytes(),
            latest: Mutex::default(),
            received: Mutex::default(),
            failures_left: AtomicUsize::new(0),
        }
    }

    fn fail_next(&self, times: usize) {
        self.failures_left.store(times, Ordering::SeqCst);
    }

    fn latest(&self, membership_id: &str) -> Option<MembershipProjection> {
        self.latest.lock().unwrap().get(membership_id).cloned()
    }

    fn received(&self) -> Vec<MembershipProjection> {
        self.received.lock().unwrap().clone()
    }
}

impl ProjectionSink for FakeConvex {
    async fn publish(&self, signed: &SignedMembershipProjection) -> Result<PublishOutcome, String> {
        if self
            .failures_left
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1))
            .is_ok()
        {
            return Err("publish failed (503 Service Unavailable)".into());
        }
        let projection = verify_projection(signed, CONTROLLER_ID, &self.controller_key)
            .map_err(|rejection| rejection.to_string())?;
        self.received.lock().unwrap().push(projection.clone());
        let mut latest = self.latest.lock().unwrap();
        let newer = latest.get(&projection.membership_id).is_none_or(|current| {
            (projection.identity_epoch, projection.sequence)
                > (current.identity_epoch, current.sequence)
        });
        if !newer {
            return Ok(PublishOutcome::Stale);
        }
        latest.insert(projection.membership_id.clone(), projection);
        Ok(PublishOutcome::Stored)
    }
}

/// A Home whose outbox starts empty, as if it had always been published.
async fn routed_home() -> Home {
    let home = Home::new().await;
    let conn = home.state.db.get().await.unwrap();
    conn.interact(|conn| {
        diesel::sql_query("TRUNCATE membership_routing_outbox").execute(conn)?;
        diesel::delete(settings::table.find(IDENTITY_EPOCH_SETTING)).execute(conn)?;
        diesel::delete(settings::table.find(ROUTING_EPOCH_SETTING)).execute(conn)
    })
    .await
    .unwrap()
    .unwrap();
    home
}

async fn drain(home: &Home, convex: &FakeConvex) -> usize {
    let mut published = 0;
    loop {
        match publish_pending(&home.state, convex).await.unwrap() {
            0 => return published,
            n => published += n,
        }
    }
}

fn routing(projection: &MembershipProjection) -> (&str, MembershipRoutingState, u64) {
    (
        projection.account_id.as_str(),
        projection.state,
        projection.identity_epoch,
    )
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn pairing_the_first_owner_publishes_a_signed_active_projection() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = routed_home().await;
    let convex = FakeConvex::for_home(&home);
    // The first run covers epoch 1 with every active Membership: none yet.
    assert_eq!(drain(&home, &convex).await, 0);

    let code = home.pairing_code().await;
    let owner = pair(
        &home,
        &code,
        61,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    assert_eq!(drain(&home, &convex).await, 1);

    let projection = convex.latest(&owner.membership_id).unwrap();
    assert_eq!(projection.controller_id, CONTROLLER_ID);
    assert_eq!(
        routing(&projection),
        ("owner-1", MembershipRoutingState::Active, 1)
    );
    // Routing facts only: the wire form has nothing else to carry a role,
    // name or email in.
    let wire = serde_json::to_value(&projection).unwrap();
    let mut fields: Vec<_> = wire.as_object().unwrap().keys().cloned().collect();
    fields.sort();
    assert_eq!(
        fields,
        [
            "accountId",
            "controllerId",
            "identityEpoch",
            "membershipId",
            "sequence",
            "state"
        ]
    );
    // Published once: nothing is pending any more.
    assert_eq!(drain(&home, &convex).await, 0);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn accepting_an_invitation_publishes_the_new_membership() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = routed_home().await;
    let convex = FakeConvex::for_home(&home);
    home.member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    let invited = home
        .member(None, "guest@example.com", "member", "pending")
        .await;
    drain(&home, &convex).await;
    // A pending Invitation has no Account to route to yet.
    assert_eq!(convex.latest(&invited.to_string()), None);

    let code = home.pairing_code().await;
    let guest = pair(
        &home,
        &code,
        62,
        identity_body("guest-1", "guest@example.com"),
    )
    .await;
    assert_eq!(guest.membership_id, invited.to_string());
    drain(&home, &convex).await;
    assert_eq!(
        routing(&convex.latest(&guest.membership_id).unwrap()),
        ("guest-1", MembershipRoutingState::Active, 1)
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn removing_a_member_and_leaving_a_home_publish_ended_projections() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = routed_home().await;
    let convex = FakeConvex::for_home(&home);
    let code = home.pairing_code().await;
    let owner = pair(
        &home,
        &code,
        63,
        identity_body("owner-1", "owner@example.com"),
    )
    .await;
    let removed = home
        .member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    home.member(Some("member-2"), "leaver@example.com", "member", "active")
        .await;
    let code = home.pairing_code().await;
    let leaver = pair(
        &home,
        &code,
        64,
        identity_body("member-2", "leaver@example.com"),
    )
    .await;
    drain(&home, &convex).await;
    let before = convex.latest(&removed.to_string()).unwrap();
    assert_eq!(before.state, MembershipRoutingState::Active);

    let owner_session = open_session(&home, &owner).await.unwrap();
    let (status, _) = home
        .call(
            "DELETE",
            &format!("/api/members/{removed}"),
            Some(&owner_session),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let leaver_session = open_session(&home, &leaver).await.unwrap();
    let (status, _) = home
        .call("POST", "/api/members/leave", Some(&leaver_session), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(drain(&home, &convex).await, 2);

    let ended = convex.latest(&removed.to_string()).unwrap();
    assert_eq!(
        routing(&ended),
        ("member-1", MembershipRoutingState::Ended, 1)
    );
    assert!(ended.sequence > before.sequence);
    assert_eq!(
        routing(&convex.latest(&leaver.membership_id).unwrap()),
        ("member-2", MembershipRoutingState::Ended, 1)
    );
    assert_eq!(
        convex.latest(&owner.membership_id).unwrap().state,
        MembershipRoutingState::Active
    );
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn publishing_retries_in_order_until_convex_acknowledges() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = routed_home().await;
    let convex = FakeConvex::for_home(&home);
    drain(&home, &convex).await;
    let member = home
        .member(Some("member-1"), "member@example.com", "member", "active")
        .await;
    let conn = home.state.db.get().await.unwrap();
    conn.interact(move |conn| {
        diesel::delete(crate::db::schema::members::table.find(member)).execute(conn)
    })
    .await
    .unwrap()
    .unwrap();

    convex.fail_next(2);
    assert!(publish_pending(&home.state, &convex).await.is_err());
    assert!(publish_pending(&home.state, &convex).await.is_err());
    assert!(convex.received().is_empty());

    assert_eq!(drain(&home, &convex).await, 2);
    let states: Vec<_> = convex.received().iter().map(|p| p.state).collect();
    assert_eq!(
        states,
        [
            MembershipRoutingState::Active,
            MembershipRoutingState::Ended
        ]
    );
    assert_eq!(
        convex.latest(&member.to_string()).unwrap().state,
        MembershipRoutingState::Ended
    );
    assert_eq!(drain(&home, &convex).await, 0);
}

#[tokio::test]
#[ignore = "requires the isolated PostgreSQL database created by the verification script"]
async fn existing_memberships_are_backfilled_and_republished_when_the_epoch_changes() {
    let _home = crate::db::HOME_TABLES.lock().await;
    let home = routed_home().await;
    let convex = FakeConvex::for_home(&home);
    let owner = home
        .member(Some("owner-1"), "owner@example.com", "owner", "active")
        .await;
    let invited = home
        .member(None, "guest@example.com", "member", "pending")
        .await;
    // Alpha Memberships predate the outbox: nothing of theirs is queued.
    let conn = home.state.db.get().await.unwrap();
    conn.interact(|conn| diesel::sql_query("TRUNCATE membership_routing_outbox").execute(conn))
        .await
        .unwrap()
        .unwrap();

    assert_eq!(drain(&home, &convex).await, 1);
    assert_eq!(
        routing(&convex.latest(&owner.to_string()).unwrap()),
        ("owner-1", MembershipRoutingState::Active, 1)
    );
    assert_eq!(convex.latest(&invited.to_string()), None);
    // Once per epoch.
    assert_eq!(drain(&home, &convex).await, 0);

    // A restore bumps the identity epoch; every active Membership is
    // republished under it, so clients re-address their envelopes.
    crate::identity::write_setting(&home.state.db, IDENTITY_EPOCH_SETTING, "2")
        .await
        .unwrap();
    assert_eq!(drain(&home, &convex).await, 1);
    assert_eq!(
        routing(&convex.latest(&owner.to_string()).unwrap()),
        ("owner-1", MembershipRoutingState::Active, 2)
    );
}
