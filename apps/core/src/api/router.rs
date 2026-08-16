use axum::Router;
use axum::http::{HeaderValue, Method};
use axum::middleware;
use axum::routing::{delete, get, patch, post};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::api::middleware::require_client_token;
use crate::api::{devices, health, identify, landing, members, pairing, rooms, ws, zigbee};
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
                    || origin == "https://app.nemu.sh"
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
    let public = Router::new()
        .route("/", get(landing::landing))
        .route("/api/health", get(health::health_check))
        .route("/api/identify", get(identify::identify))
        .route("/api/pair", post(pairing::pair))
        .route("/api/pairing-code", post(pairing::create_pairing_code));

    let protected = Router::new()
        .route("/api/devices", get(devices::list_devices))
        .route(
            "/api/devices/{id}",
            get(devices::get_device)
                .patch(devices::patch_device)
                .delete(devices::delete_device),
        )
        .route("/api/devices/{id}/set", post(devices::set_device))
        .route(
            "/api/rooms",
            get(rooms::list_rooms).post(rooms::create_room),
        )
        .route(
            "/api/rooms/{id}",
            patch(rooms::patch_room).delete(rooms::delete_room),
        )
        .route("/api/zigbee/permit-join", post(zigbee::permit_join))
        .route("/api/tokens", get(pairing::list_tokens))
        .route("/api/tokens/current", delete(pairing::delete_current_token))
        .route("/api/tokens/{id}", delete(pairing::delete_token))
        .route(
            "/api/members",
            get(members::list_members_handler).post(members::invite_member_handler),
        )
        .route(
            "/api/members/bootstrap",
            post(members::bootstrap_owner_handler),
        )
        .route("/api/members/{id}", delete(members::delete_member_handler))
        .route("/ws", get(ws::ws_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_client_token,
        ));

    public
        .merge(protected)
        .layer(cors_layer())
        .with_state(state)
}
