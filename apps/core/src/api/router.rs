use axum::Router;
use axum::http::{HeaderValue, Method};
use axum::routing::{get, patch, post};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::api::{devices, health, rooms, ws, zigbee};
use crate::state::AppState;

/// Allow browser webviews (Next.js dev/prod) to call the LAN controller API.
fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(
            |origin: &HeaderValue, _request_parts| {
                let Ok(origin) = origin.to_str() else {
                    return false;
                };
                origin.starts_with("http://localhost:")
                    || origin.starts_with("http://127.0.0.1:")
                    || origin.starts_with("http://nemu.local:")
                    || origin.starts_with("https://localhost:")
                    || origin.starts_with("https://127.0.0.1:")
                    || origin.starts_with("https://nemu.local:")
                    || origin == "https://dashboard.nemu.sh"
                    || origin == "https://nemu.sh"
            },
        ))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::ACCEPT,
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ])
        .allow_credentials(true)
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health::health_check))
        .route("/api/devices", get(devices::list_devices))
        .route(
            "/api/devices/{id}",
            get(devices::get_device).patch(devices::patch_device),
        )
        .route("/api/devices/{id}/set", post(devices::set_device))
        .route("/api/rooms", get(rooms::list_rooms).post(rooms::create_room))
        .route(
            "/api/rooms/{id}",
            patch(rooms::patch_room).delete(rooms::delete_room),
        )
        .route("/api/zigbee/permit-join", post(zigbee::permit_join))
        .route("/ws", get(ws::ws_handler))
        .layer(cors_layer())
        .with_state(state)
}
