use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, Uri};
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::pairing::access_clients::find_access_client;
use crate::pairing::local_sessions::revoked;
use crate::pairing::tombstones::access_client_status;
use crate::relay_crypto::envelope::AccessClientStatus;
use crate::state::AppState;

/// The `Authorization` scheme for a Local session.
pub const LOCAL_SESSION_SCHEME: &str = "NemuSession";
/// The WebSocket query parameter for a Local session; browsers cannot set
/// headers on a WebSocket.
pub const LOCAL_SESSION_QUERY: &str = "session";

/// The error code for a bearer token. Alpha Access Clients held one; they
/// pair again at home (NEM-131), and clients treat this code that way.
pub const BEARER_TOKEN_RETIRED: &str = "bearer_token_retired";

/// An Access Client paired with CPace, authenticated by a Local session on
/// the home network or by a sealed request over Relay.
#[derive(Debug, Clone)]
pub struct AuthenticatedClient {
    pub access_client_id: Uuid,
    pub label: String,
    /// The Account of the caller's Membership. The role is looked up from it
    /// on every request; no credential carries one.
    pub user_id: Option<String>,
}

impl FromRequestParts<AppState> for AuthenticatedClient {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // The route layer already authenticated protected routes.
        if let Some(auth) = parts.extensions.get::<AuthenticatedClient>() {
            return Ok(auth.clone());
        }
        authenticate(state, &parts.headers, &parts.uri).await
    }
}

fn unauthorized(code: &str, message: &str) -> ApiError {
    ApiError::new(StatusCode::UNAUTHORIZED, code, message)
}

/// Authenticates a LAN request by its Local session.
///
/// A bearer token (the `Bearer` scheme or `?token=`) is refused outright,
/// even next to a valid Local session, with [`BEARER_TOKEN_RETIRED`]. It is
/// never looked up: the Controller keeps no bearer tokens.
pub async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    uri: &Uri,
) -> Result<AuthenticatedClient, ApiError> {
    if presents_bearer_token(headers, uri) {
        return Err(unauthorized(
            BEARER_TOKEN_RETIRED,
            "Bearer tokens no longer work. Pair this device again at home.",
        ));
    }
    let session = extract_local_session(headers)
        .or_else(|| extract_query(uri, LOCAL_SESSION_QUERY))
        .ok_or_else(|| unauthorized("unauthorized", "Missing Local session"))?;
    authenticate_local_session(state, &session).await
}

fn presents_bearer_token(headers: &HeaderMap, uri: &Uri) -> bool {
    let bearer_header = headers
        .get_all(axum::http::header::AUTHORIZATION)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .any(|value| {
            value
                .split_once(' ')
                .is_some_and(|(scheme, _)| scheme.eq_ignore_ascii_case("bearer"))
        });
    bearer_header || extract_query(uri, "token").is_some()
}

async fn authenticate_local_session(
    state: &AppState,
    session: &str,
) -> Result<AuthenticatedClient, ApiError> {
    let invalid = || {
        unauthorized(
            "local_session_invalid",
            "This Local session expired or was revoked. Open a new one.",
        )
    };
    let id = state.local_sessions.resolve(session).ok_or_else(invalid)?;
    let status = access_client_status(&state.db, &id.to_string())
        .await
        .map_err(ApiError::internal)?;
    if status == AccessClientStatus::Tombstoned {
        state.local_sessions.drop_access_client(id);
        return Err(revoked());
    }
    let Some((access_client, member)) = find_access_client(&state.db, id)
        .await
        .map_err(ApiError::internal)?
    else {
        state.local_sessions.drop_access_client(id);
        return Err(invalid());
    };
    Ok(AuthenticatedClient {
        access_client_id: access_client.id,
        label: access_client.label,
        user_id: member.user_id,
    })
}

fn extract_scheme(headers: &HeaderMap, scheme: &str) -> Option<String> {
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    let (found, token) = value.split_once(' ')?;
    if found != scheme || token.is_empty() {
        return None;
    }
    Some(token.to_string())
}

pub fn extract_local_session(headers: &HeaderMap) -> Option<String> {
    extract_scheme(headers, LOCAL_SESSION_SCHEME)
}

fn extract_query(uri: &Uri, name: &str) -> Option<String> {
    let query = uri.query()?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == name && !value.is_empty() {
            return Some(urlencoding_decode(value).unwrap_or_else(|| value.to_string()));
        }
    }
    None
}

fn urlencoding_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &value[i + 1..i + 3];
                let decoded = u8::from_str_radix(hex, 16).ok()?;
                out.push(decoded);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}
