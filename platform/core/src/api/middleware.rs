use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::api::auth::authenticate;
use crate::api::error::ApiError;
use crate::state::AppState;

/// Admits a Local session or, until NEM-131, a bearer token, and hands the
/// caller to the handler.
pub async fn require_client_token(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let auth = authenticate(&state, request.headers(), request.uri()).await?;
    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}
