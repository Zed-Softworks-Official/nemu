//! Core's side of the Relay mailbox in Convex: it reads sealed requests for
//! this Controller (a `relay:pendingForMe` subscription, or the HTTP
//! fallback) and posts each sealed reply back, along with the sealed
//! capability pushes of [`crate::relay::watches`]. Everything about a
//! request, from its checks to its reply, is [`crate::relay::handler`]'s.

use std::collections::{BTreeMap, HashSet, VecDeque};
use std::time::Duration;

use convex::{AuthenticationToken, ConvexClient, FunctionResult, Value};
use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{Value as JsonValue, json};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::registration::{convex_cloud_url, fetch_controller_session, register_with_convex};
use crate::relay::handler::handle_sealed_request;
use crate::relay::watches::CapabilityPushes;
use crate::relay_crypto::envelope::{SealedPush, SealedRequest};
use crate::state::AppState;

/// HTTP fallback poll interval when the WebSocket client is unavailable.
const FALLBACK_POLL_INTERVAL_MS: u64 = 15_000;
const IDLE_BACKOFF_MS: u64 = 5_000;
const FALLBACK_ROUNDS_BEFORE_RETRY: u32 = 4;
/// Requests recently handled, so a stale subscription result that still
/// lists one does not hand it to the handler twice.
const RECENTLY_HANDLED: usize = 1024;
/// Sealed pushes waiting to be posted. Past this the push loop waits, its
/// capability subscription lags, and the next push is a snapshot.
const PUSH_QUEUE: usize = 256;

enum RespondVia<'a> {
    Convex(&'a mut ConvexClient),
    Http { site_url: &'a str },
}

pub fn spawn_relay_loop(state: AppState) {
    tokio::spawn(async move {
        run_relay_loop(state).await;
    });
}

async fn run_relay_loop(state: AppState) {
    let Some(site_url) = state.convex_site_url.clone() else {
        info!("NEMU_CONVEX_SITE_URL unset; relay client disabled");
        return;
    };
    let cloud_url = convex_cloud_url(&site_url);

    info!(%cloud_url, "relay client started");
    spawn_capability_pushes(state.clone(), site_url.clone());
    crate::pairing::routing::spawn_publisher(
        state.clone(),
        crate::pairing::routing::HttpSink::new(&site_url, state.registration_secret.clone()),
    );

    loop {
        match run_subscription_relay(&state, &site_url, &cloud_url).await {
            Ok(()) => {
                warn!("relay subscription ended; reconnecting");
            }
            Err(e) => {
                warn!(error = %e, "relay subscription failed; entering HTTP fallback");
                let _ = register_with_convex(
                    &site_url,
                    &state.identity,
                    state.registration_secret.as_deref(),
                    state.lan_ip.as_deref(),
                )
                .await;
                run_http_fallback(&state, &site_url).await;
            }
        }
        tokio::time::sleep(Duration::from_millis(IDLE_BACKOFF_MS)).await;
    }
}

/// Seals every capability change and commissioning step for each live watch
/// and posts the pushes to the mailbox one at a time, so they arrive in
/// counter order.
fn spawn_capability_pushes(state: AppState, site_url: String) {
    let (pushes, mut sealed) = mpsc::channel::<SealedPush>(PUSH_QUEUE);
    tokio::spawn(CapabilityPushes::new(state.clone()).run(pushes));
    tokio::spawn(async move {
        while let Some(push) = sealed.recv().await {
            let via = &mut RespondVia::Http {
                site_url: &site_url,
            };
            if let Err(error) = respond(&state, via, &push).await {
                // The watch's next push skips a counter, so its client
                // sees the gap and re-reads the capability snapshot.
                warn!(%error, "failed to post a capability push");
            }
        }
    });
}

async fn run_subscription_relay(
    state: &AppState,
    site_url: &str,
    cloud_url: &str,
) -> Result<(), String> {
    let mut client = ConvexClient::new(cloud_url)
        .await
        .map_err(|e| format!("convex client connect failed: {e}"))?;

    let site_url_owned = site_url.to_string();
    let controller_id = state.identity.controller_id.clone();
    let registration_secret = state.registration_secret.clone();

    let fetcher = {
        let site_url_owned = site_url_owned.clone();
        let controller_id = controller_id.clone();
        let registration_secret = registration_secret.clone();
        Box::new(move |_force_refresh: bool| {
            let site_url_owned = site_url_owned.clone();
            let controller_id = controller_id.clone();
            let registration_secret = registration_secret.clone();
            Box::pin(async move {
                let session = fetch_controller_session(
                    &site_url_owned,
                    &controller_id,
                    registration_secret.as_deref(),
                )
                .await
                .map_err(anyhow::Error::msg)?;
                Ok(AuthenticationToken::User(session.token))
            })
                as std::pin::Pin<
                    Box<
                        dyn std::future::Future<Output = anyhow::Result<AuthenticationToken>>
                            + Send,
                    >,
                >
        }) as convex::AuthTokenFetcher
    };

    client.set_auth_callback(Some(fetcher)).await;

    let mut sub = client
        .subscribe("relay:pendingForMe", BTreeMap::new())
        .await
        .map_err(|e| format!("subscribe pendingForMe failed: {e}"))?;

    info!("relay subscription active");
    state.health.set_relay(true);
    let outcome = relay_pending_messages(state, &mut client, &mut sub).await;
    state.health.set_relay(false);
    outcome
}

/// Requests handled lately, oldest first.
#[derive(Default)]
struct Handled {
    order: VecDeque<String>,
    keys: HashSet<String>,
}

impl Handled {
    fn key(sealed: &SealedRequest) -> String {
        let header = &sealed.header;
        json!([header.access_client_id, header.request_id, header.counter]).to_string()
    }

    /// Records `sealed`; `false` when it was already handled.
    fn first_time(&mut self, sealed: &SealedRequest) -> bool {
        let key = Self::key(sealed);
        if !self.keys.insert(key.clone()) {
            return false;
        }
        self.order.push_back(key);
        if self.order.len() > RECENTLY_HANDLED
            && let Some(oldest) = self.order.pop_front()
        {
            self.keys.remove(&oldest);
        }
        true
    }
}

async fn relay_pending_messages(
    state: &AppState,
    client: &mut ConvexClient,
    sub: &mut convex::QuerySubscription,
) -> Result<(), String> {
    let mut handled = Handled::default();
    let mut mut_client = client.clone();

    while let Some(result) = sub.next().await {
        let requests = match parse_pending_result(result) {
            Ok(requests) => requests,
            Err(e) => {
                warn!(error = %e, "pendingForMe result error");
                return Err(e);
            }
        };

        for sealed in requests {
            if !handled.first_time(&sealed) {
                continue;
            }
            let Some(reply) = handle_sealed_request(state, &sealed).await else {
                continue;
            };
            respond(state, &mut RespondVia::Convex(&mut mut_client), &reply).await?;
        }
    }

    Ok(())
}

async fn run_http_fallback(state: &AppState, site_url: &str) {
    let mut consecutive_failures: u32 = 0;
    for _ in 0..FALLBACK_ROUNDS_BEFORE_RETRY {
        let polled = poll_and_process_http(state, site_url).await;
        state.health.set_relay(polled.is_ok());
        match polled {
            Ok(processed) => {
                consecutive_failures = 0;
                if processed == 0 {
                    tokio::time::sleep(Duration::from_millis(FALLBACK_POLL_INTERVAL_MS)).await;
                }
            }
            Err(e) => {
                consecutive_failures = consecutive_failures.saturating_add(1);
                warn!(error = %e, failures = consecutive_failures, "relay HTTP fallback poll failed");
                if consecutive_failures >= 3 {
                    let _ = register_with_convex(
                        site_url,
                        &state.identity,
                        state.registration_secret.as_deref(),
                        state.lan_ip.as_deref(),
                    )
                    .await;
                }
                tokio::time::sleep(Duration::from_millis(IDLE_BACKOFF_MS)).await;
            }
        }
    }
}

async fn poll_and_process_http(state: &AppState, site_url: &str) -> Result<usize, String> {
    let url = format!("{}/relay/pending", site_url.trim_end_matches('/'));
    let body = json!({
        "controllerId": state.identity.controller_id,
        "registrationSecret": state.registration_secret,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("pending request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("pending failed ({status})"));
    }

    let pending: JsonValue = response
        .json()
        .await
        .map_err(|e| format!("pending decode failed: {e}"))?;
    let requests = sealed_requests(pending.get("messages").cloned().unwrap_or(JsonValue::Null))?;

    for sealed in &requests {
        let Some(reply) = handle_sealed_request(state, sealed).await else {
            continue;
        };
        if let Err(e) = respond(state, &mut RespondVia::Http { site_url }, &reply).await {
            warn!(error = %e, "failed to post relay reply");
        }
    }

    Ok(requests.len())
}

fn parse_pending_result(result: FunctionResult) -> Result<Vec<SealedRequest>, String> {
    let value = match result {
        FunctionResult::Value(value) => value,
        FunctionResult::ErrorMessage(message) => return Err(message),
        FunctionResult::ConvexError(err) => return Err(err.message),
    };
    sealed_requests(value.export())
}

/// The mailbox's sealed requests. One this Controller cannot read is
/// skipped, not the batch; it expires from the mailbox on its own.
fn sealed_requests(list: JsonValue) -> Result<Vec<SealedRequest>, String> {
    let JsonValue::Array(rows) = list else {
        return Err("pending requests are not a list".to_string());
    };
    Ok(rows
        .into_iter()
        .filter_map(|row| serde_json::from_value(integral_numbers(row)).ok())
        .collect())
}

/// Convex numbers are doubles, which export as JSON floats (`1.0`). The
/// header's integers are read back as integers.
fn integral_numbers(value: JsonValue) -> JsonValue {
    match value {
        JsonValue::Number(number) => match number.as_f64() {
            Some(float)
                if number.is_f64()
                    && float.fract() == 0.0
                    && (0.0..=crate::relay_crypto::wire::MAX_SAFE_INTEGER as f64)
                        .contains(&float) =>
            {
                json!(float as u64)
            }
            _ => JsonValue::Number(number),
        },
        JsonValue::Array(items) => {
            JsonValue::Array(items.into_iter().map(integral_numbers).collect())
        }
        JsonValue::Object(map) => JsonValue::Object(
            map.into_iter()
                .map(|(key, value)| (key, integral_numbers(value)))
                .collect(),
        ),
        other => other,
    }
}

/// Posts a sealed response or push to the mailbox.
async fn respond(
    state: &AppState,
    respond_via: &mut RespondVia<'_>,
    reply: &impl Serialize,
) -> Result<(), String> {
    let sealed = serde_json::to_value(reply).map_err(|e| format!("reply encode failed: {e}"))?;
    match respond_via {
        RespondVia::Convex(client) => {
            let mut args = BTreeMap::new();
            args.insert(
                "sealed".into(),
                Value::try_from(sealed).map_err(|e| format!("reply encode failed: {e}"))?,
            );
            match client
                .mutation("relay:respondAsController", args)
                .await
                .map_err(|e| format!("respond mutation failed: {e}"))?
            {
                FunctionResult::Value(_) => Ok(()),
                FunctionResult::ErrorMessage(message) => Err(message),
                FunctionResult::ConvexError(err) => Err(err.message),
            }
        }
        RespondVia::Http { site_url } => {
            let url = format!("{}/relay/respond", site_url.trim_end_matches('/'));
            let body = json!({
                "registrationSecret": state.registration_secret,
                "sealed": sealed,
            });
            let response = reqwest::Client::new()
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("respond request failed: {e}"))?;
            if !response.status().is_success() {
                let status = response.status();
                return Err(format!("respond failed ({status})"));
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sealed_row(counter: JsonValue) -> JsonValue {
        json!({
            "header": {
                "controllerId": "nemu_00000000feedbeef",
                "identityEpoch": 1.0,
                "accessClientId": "ac",
                "requestId": "r1",
                "counter": counter,
                "expiresAt": 1_700_000_000_000.0_f64,
            },
            "enc": "e",
            "ciphertext": "c",
            "signature": "s",
        })
    }

    #[test]
    fn convex_doubles_read_back_as_header_integers() {
        let requests = sealed_requests(json!([sealed_row(json!(7.0))])).unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].header.counter, 7);
        assert_eq!(requests[0].header.expires_at, 1_700_000_000_000);
    }

    #[test]
    fn an_unreadable_row_is_skipped_not_the_batch() {
        let requests = sealed_requests(json!([
            sealed_row(json!(1.5)),
            { "payload": "old plaintext row" },
            sealed_row(json!(2.0)),
        ]))
        .unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].header.counter, 2);
        assert!(sealed_requests(json!({ "not": "a list" })).is_err());
    }

    #[test]
    fn a_request_is_handled_once_however_often_it_is_listed() {
        let request: SealedRequest =
            serde_json::from_value(integral_numbers(sealed_row(json!(1.0)))).unwrap();
        let mut handled = Handled::default();
        assert!(handled.first_time(&request));
        assert!(!handled.first_time(&request));
        let retry = SealedRequest {
            header: crate::relay_crypto::envelope::RequestHeader {
                counter: 2,
                ..request.header.clone()
            },
            ..request
        };
        assert!(handled.first_time(&retry));
    }
}
