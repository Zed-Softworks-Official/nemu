use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode, Uri};
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::db::models::ClientToken;
use crate::pairing::access_clients::{count_access_clients, find_access_client};
use crate::pairing::local_sessions::revoked;
use crate::pairing::tokens::{count_client_tokens, verify_client_token};
use crate::pairing::tombstones::access_client_status;
use crate::relay_crypto::envelope::AccessClientStatus;
use crate::state::{AppState, DbPool};

/// The `Authorization` scheme for a Local session.
pub const LOCAL_SESSION_SCHEME: &str = "NemuSession";
/// The WebSocket query parameter for a Local session; browsers cannot set
/// headers on a WebSocket.
pub const LOCAL_SESSION_QUERY: &str = "session";

/// How the caller proved it is an Access Client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Credential {
    /// A bearer token from `POST /api/pair` or `sessionMint`. NEM-131
    /// removes these.
    ClientToken,
    /// A Local session of an Access Client paired with CPace.
    AccessClient,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AuthenticatedClient {
    /// The bearer token's ID, or the Access Client's ID.
    pub token_id: Uuid,
    pub label: String,
    /// The Account of the caller's Membership. The role is looked up from it
    /// on every request; no credential carries one.
    pub user_id: Option<String>,
    pub credential: Credential,
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

impl AuthenticatedClient {
    pub fn from_row(row: ClientToken) -> Self {
        Self {
            token_id: row.id,
            label: row.label,
            user_id: row.user_id,
            credential: Credential::ClientToken,
        }
    }
}

fn unauthorized(code: &str, message: &str) -> ApiError {
    ApiError::new(StatusCode::UNAUTHORIZED, code, message)
}

/// Authenticates a LAN request by its Local session or, until NEM-131, its
/// bearer token.
pub async fn authenticate(
    state: &AppState,
    headers: &HeaderMap,
    uri: &Uri,
) -> Result<AuthenticatedClient, ApiError> {
    if let Some(session) =
        extract_local_session(headers).or_else(|| extract_query(uri, LOCAL_SESSION_QUERY))
    {
        return authenticate_local_session(state, &session).await;
    }

    let token = extract_bearer(headers)
        .or_else(|| extract_query_token(uri))
        .ok_or_else(|| unauthorized("unauthorized", "Missing client token"))?;
    let row = verify_client_token(&state.db, &token)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(|| unauthorized("unauthorized", "Invalid client token"))?;
    Ok(AuthenticatedClient::from_row(row))
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
        token_id: access_client.id,
        label: access_client.label,
        user_id: member.user_id,
        credential: Credential::AccessClient,
    })
}

/// Bearer-token and CPace Access Clients together. First-run pairing stays
/// open only while this is zero.
pub async fn count_access_credentials(pool: &DbPool) -> Result<i64, String> {
    Ok(count_client_tokens(pool).await? + count_access_clients(pool).await?)
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

pub fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    extract_scheme(headers, "Bearer")
}

pub fn extract_query_token(uri: &Uri) -> Option<String> {
    extract_query(uri, "token")
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
