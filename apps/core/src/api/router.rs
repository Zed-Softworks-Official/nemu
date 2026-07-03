use crate::api::health;
use axum::{Router, routing::get};

pub fn create_router() -> Router {
    Router::new().route("/api/health", get(health::health_check))
}
