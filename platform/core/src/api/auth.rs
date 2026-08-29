use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::db::models::ClientToken;
use crate::pairing::tokens::verify_client_token;
use crate::state::AppState;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AuthenticatedClient {
    pub token_id: Uuid,
    pub label: String,
    pub user_id: Option<String>,
}

impl FromRequestParts<AppState> for AuthenticatedClient {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_bearer(&parts.headers)
            .or_else(|| extract_query_token(&parts.uri))
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Missing client token",
                )
            })?;

        let row = verify_client_token(&state.db, &token)
            .await
            .map_err(ApiError::internal)?
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNAUTHORIZED,
                    "unauthorized",
                    "Invalid client token",
                )
            })?;

        Ok(AuthenticatedClient::from_row(row))
    }
}

impl AuthenticatedClient {
    pub fn from_row(row: ClientToken) -> Self {
        Self {
            token_id: row.id,
            label: row.label,
            user_id: row.user_id,
        }
    }
}

pub fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let value = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    let token = value.strip_prefix("Bearer ")?;
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

pub fn extract_query_token(uri: &axum::http::Uri) -> Option<String> {
    let query = uri.query()?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == "token" && !value.is_empty() {
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
