use crate::api::auth::AuthenticatedClient;
use crate::api::error::{ApiError, ApiResult};
use crate::db::models::Room;
use crate::db::schema::rooms;
use crate::events::RoomResource;
use crate::setup;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, State};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct RoomsResponse {
    pub rooms: Vec<RoomResource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomBody {
    pub name: String,
    pub sort_order: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRoomBody {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRoomBody {
    /// Required; `null` moves the Room's contents to No Room.
    #[serde(deserialize_with = "crate::api::devices::required_nullable")]
    pub destination_room_id: Option<String>,
}

pub async fn list_rooms(State(state): State<AppState>) -> ApiResult<Json<RoomsResponse>> {
    Ok(Json(RoomsResponse {
        rooms: load_rooms(&state).await?,
    }))
}

/// The Home's Rooms in display order, for LAN and Relay alike.
pub async fn load_rooms(state: &AppState) -> ApiResult<Vec<RoomResource>> {
    let conn = state
        .db
        .get()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let rows = conn
        .interact(|conn| {
            rooms::table
                .order(rooms::sort_order.asc())
                .select(Room::as_select())
                .load::<Room>(conn)
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok(rows.iter().map(RoomResource::from).collect())
}

pub async fn create_room(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Json(body): Json<CreateRoomBody>,
) -> ApiResult<(axum::http::StatusCode, Json<RoomResource>)> {
    let room = setup::create_room(&state, &auth, &body.name, body.sort_order).await?;
    Ok((axum::http::StatusCode::CREATED, Json(room)))
}

pub async fn patch_room(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
    Json(body): Json<PatchRoomBody>,
) -> ApiResult<Json<RoomResource>> {
    let room =
        setup::update_room(&state, &auth, &id, body.name.as_deref(), body.sort_order).await?;
    Ok(Json(room))
}

pub async fn delete_room(
    State(state): State<AppState>,
    auth: AuthenticatedClient,
    Path(id): Path<String>,
    Json(body): Json<DeleteRoomBody>,
) -> ApiResult<axum::http::StatusCode> {
    setup::delete_room(&state, &auth, &id, body.destination_room_id.as_deref()).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
