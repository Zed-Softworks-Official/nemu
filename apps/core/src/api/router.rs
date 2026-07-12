use axum::Router;
use axum::routing::{get, patch, post};

use crate::api::{devices, health, rooms, ws, zigbee};
use crate::state::AppState;

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
        .with_state(state)
}
