//! Capability watches over Relay, and their sealed pushes (ADR-0001,
//! NEM-132, NEM-123).
//!
//! An Access Client registers a watch with a sealed `watchCapabilityChanges`
//! request. The watch keeps that request's header and the push key exported
//! from its HPKE context, and is bound to the Access Client, not to a
//! bearer token. Every capability change, and every commissioning step, is
//! then sealed once per live watch under its push key, with the watch's own
//! counter as the nonce, and signed by the Controller, so Convex stores only
//! the clear push header and an opaque ciphertext.
//!
//! Commissioning progress rides the capability watch rather than a watch of
//! its own: every Access Client that follows the Home over Relay already
//! holds one, so progress needs no extra registration, renewal or poll, and
//! one counter orders progress and state changes together. Progress goes to
//! every live watch, as it goes to every LAN WebSocket. It is only enums
//! (`commissioning_progress.rs`), so it carries no pairing code, passcode or
//! Wi-Fi credential. Starting commissioning stays LAN-only (NEM-98).
//!
//! A watch ends when its TTL passes, when the Access Client renews it (the
//! renewal names the watch it replaces), and at once when the Access Client
//! is revoked: Leaving a Home, removing a Member, or revoking a device all
//! end its Local sessions through `LocalSessions::drop_access_client`, whose
//! broadcast also ends its watches here.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use ed25519_dalek::SigningKey;
use tokio::sync::broadcast::error::{RecvError, TryRecvError};
use tokio::sync::{broadcast, mpsc};
use tracing::{debug, warn};
use uuid::Uuid;

use crate::capabilities::CapabilityChange;
use crate::events::DeviceEvent;
use crate::pairing::tombstones::access_client_status;
use crate::relay_crypto::envelope::{
    AccessClientStatus, RequestHeader, RequestKeys, SealedPush, seal_push,
};
use crate::state::AppState;

/// How long a watch lives without a renewal. Clients renew every 20 s.
pub const CAPABILITY_WATCH_TTL: Duration = Duration::from_secs(45);

/// Live watches one Access Client may hold, one per open tab or app. The
/// oldest is dropped past this.
pub const MAX_WATCHES_PER_ACCESS_CLIENT: usize = 8;

struct Watch {
    access_client_id: Uuid,
    header: RequestHeader,
    keys: RequestKeys,
    /// The counter of the last push sealed on this watch; pushes start at 1.
    last_counter: u64,
    expires_at: Instant,
}

/// The Controller's live capability watches. Memory only: a restart ends
/// every watch, and clients register again on their next renewal.
#[derive(Default)]
pub struct CapabilityWatches {
    watches: Mutex<Vec<Watch>>,
}

impl CapabilityWatches {
    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<Watch>> {
        self.watches.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Registers the watch `header` asked for, replacing the Access
    /// Client's watch `renews` names.
    pub(crate) fn register(
        &self,
        access_client_id: Uuid,
        header: RequestHeader,
        keys: RequestKeys,
        renews: Option<&str>,
        now: Instant,
    ) {
        let mut watches = self.lock();
        watches.retain(|watch| {
            watch.expires_at > now
                && !(watch.access_client_id == access_client_id
                    && (Some(watch.header.request_id.as_str()) == renews
                        || watch.header.request_id == header.request_id))
        });
        let held = watches
            .iter()
            .filter(|watch| watch.access_client_id == access_client_id)
            .count();
        if held >= MAX_WATCHES_PER_ACCESS_CLIENT
            && let Some(oldest) = watches
                .iter()
                .position(|watch| watch.access_client_id == access_client_id)
        {
            watches.remove(oldest);
        }
        watches.push(Watch {
            access_client_id,
            header,
            keys,
            last_counter: 0,
            expires_at: now + CAPABILITY_WATCH_TTL,
        });
    }

    /// Ends every watch of a revoked Access Client.
    pub(crate) fn end(&self, access_client_id: Uuid) {
        self.lock()
            .retain(|watch| watch.access_client_id != access_client_id);
    }

    fn access_client_ids(&self) -> Vec<Uuid> {
        let mut ids: Vec<Uuid> = self
            .lock()
            .iter()
            .map(|watch| watch.access_client_id)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    }

    /// Seals `plaintext` once per watch live at `now`, each under its own
    /// push key and next counter.
    fn seal(&self, plaintext: &[u8], signing_key: &SigningKey, now: Instant) -> Vec<SealedPush> {
        let mut watches = self.lock();
        watches.retain(|watch| watch.expires_at > now);
        watches
            .iter_mut()
            .filter_map(|watch| {
                let counter = watch.last_counter + 1;
                let sealed =
                    seal_push(&watch.header, &watch.keys, counter, plaintext, signing_key).ok()?;
                watch.last_counter = counter;
                Some(sealed)
            })
            .collect()
    }
}

/// Ends the watch again if its Access Client was revoked between opening
/// the request and registering it, so a revocation is never outrun.
pub(crate) async fn register(
    state: &AppState,
    access_client_id: Uuid,
    header: &RequestHeader,
    keys: &RequestKeys,
    renews: Option<&str>,
) -> Result<(), String> {
    state.capability_watches.register(
        access_client_id,
        header.clone(),
        keys.clone(),
        renews,
        Instant::now(),
    );
    let status = access_client_status(&state.db, &access_client_id.to_string()).await?;
    if !matches!(status, AccessClientStatus::Active { .. }) {
        state.capability_watches.end(access_client_id);
    }
    Ok(())
}

/// Seals capability changes and commissioning progress for every live
/// watch, ending the watches of revoked Access Clients first.
pub struct CapabilityPushes {
    state: AppState,
    revocations: broadcast::Receiver<Uuid>,
    changes: broadcast::Receiver<CapabilityChange>,
    events: broadcast::Receiver<DeviceEvent>,
}

impl CapabilityPushes {
    /// Subscribes at once, so nothing emitted after this is missed.
    pub fn new(state: AppState) -> Self {
        let revocations = state.local_sessions.revocations();
        let changes = state.capabilities.subscribe();
        let events = state.events.subscribe();
        Self {
            state,
            revocations,
            changes,
            events,
        }
    }

    /// The sealed pushes of `event`, one per live watch.
    pub async fn seal(&mut self, event: &DeviceEvent) -> Vec<SealedPush> {
        self.seal_at(event, Instant::now()).await
    }

    pub(crate) async fn seal_at(&mut self, event: &DeviceEvent, now: Instant) -> Vec<SealedPush> {
        self.end_revoked().await;
        let Ok(plaintext) = serde_json::to_vec(event) else {
            return Vec::new();
        };
        self.state.capability_watches.seal(
            &plaintext,
            &self.state.identity.keypair.signing_key,
            now,
        )
    }

    /// Ends the watches of every Access Client revoked since the last call.
    async fn end_revoked(&mut self) {
        loop {
            match self.revocations.try_recv() {
                Ok(id) => self.state.capability_watches.end(id),
                Err(TryRecvError::Empty | TryRecvError::Closed) => return,
                Err(TryRecvError::Lagged(_)) => self.end_unless_active().await,
            }
        }
    }

    /// Revocations were missed: asks the database about every watcher.
    async fn end_unless_active(&self) {
        for id in self.state.capability_watches.access_client_ids() {
            match access_client_status(&self.state.db, &id.to_string()).await {
                Ok(AccessClientStatus::Active { .. }) => {}
                Ok(_) => self.state.capability_watches.end(id),
                // Fail closed: the client registers again on its renewal.
                Err(error) => {
                    warn!(%error, "capability watch check failed; ending the watch");
                    self.state.capability_watches.end(id);
                }
            }
        }
    }

    /// Seals every capability change and commissioning step until the
    /// service stops, handing each push to `out` in order. A revocation ends
    /// its watches as it arrives.
    pub async fn run(mut self, out: mpsc::Sender<SealedPush>) {
        let mut revocations_open = true;
        let mut events_open = true;
        loop {
            let event = tokio::select! {
                biased;
                revoked = self.revocations.recv(), if revocations_open => {
                    match revoked {
                        Ok(id) => self.state.capability_watches.end(id),
                        Err(RecvError::Lagged(_)) => self.end_unless_active().await,
                        Err(RecvError::Closed) => revocations_open = false,
                    }
                    continue;
                }
                change = self.changes.recv() => match change {
                    Ok(change) => DeviceEvent::from_capability_change(change),
                    Err(RecvError::Lagged(skipped)) => {
                        warn!(skipped, "capability pushes lagged; pushing a snapshot");
                        DeviceEvent::from_capability_snapshot(self.state.capabilities.snapshot())
                    }
                    Err(RecvError::Closed) => return,
                },
                event = self.events.recv(), if events_open => match event {
                    Ok(event) if relay_pushes(&event) => event,
                    Ok(_) => continue,
                    // Progress is transient: a skipped step is followed by the next.
                    Err(RecvError::Lagged(skipped)) => {
                        debug!(skipped, "commissioning pushes lagged");
                        continue;
                    }
                    Err(RecvError::Closed) => {
                        events_open = false;
                        continue;
                    }
                },
            };
            for push in self.seal(&event).await {
                if out.send(push).await.is_err() {
                    return;
                }
            }
        }
    }
}

/// Whether a Home event goes to the watches. Only the Protocol-neutral
/// commissioning step does: capability changes come from their own
/// subscription, and the older commissioning and interview events carry free
/// text, so they stay on the LAN WebSocket.
fn relay_pushes(event: &DeviceEvent) -> bool {
    matches!(event, DeviceEvent::CommissioningStep(_))
}
