use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::api::auth::{extract_bearer, extract_query_token};
use crate::api::error::ApiError;
use crate::pairing::tokens::verify_client_token;
use crate::state::AppState;
use axum::http::StatusCode;

pub async fn require_client_token(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let token = extract_bearer(request.headers())
        .or_else(|| extract_query_token(request.uri()))
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Missing client token",
            )
        })?;

    let valid = verify_client_token(&state.db, &token)
        .await
        .map_err(ApiError::internal)?
        .is_some();

    if !valid {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Invalid client token",
        ));
    }

    Ok(next.run(request).await)
}
