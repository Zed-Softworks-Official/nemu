use axum::Json;
use axum::extract::{Path, State};
use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::error::{ApiError, ApiResult};
use crate::db::models::{NewRoom, Room, UpdateRoom};
use crate::db::schema::rooms;
use crate::events::RoomResource;
use crate::state::AppState;

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

pub async fn list_rooms(State(state): State<AppState>) -> ApiResult<Json<RoomsResponse>> {
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

    Ok(Json(RoomsResponse {
        rooms: rows.iter().map(RoomResource::from).collect(),
    }))
}

pub async fn create_room(
    State(state): State<AppState>,
    Json(body): Json<CreateRoomBody>,
) -> ApiResult<(axum::http::StatusCode, Json<RoomResource>)> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_name",
            "name must not be empty",
        ));
    }
    let sort_order = body.sort_order.unwrap_or(0);

    let conn = state
        .db
        .get()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let room = conn
        .interact(move |conn| {
            diesel::insert_into(rooms::table)
                .values(NewRoom {
                    name: &name,
                    sort_order,
                })
                .returning(Room::as_returning())
                .get_result::<Room>(conn)
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(|e| ApiError::internal(e.to_string()))?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(RoomResource::from(&room)),
    ))
}

pub async fn patch_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchRoomBody>,
) -> ApiResult<Json<RoomResource>> {
    let room_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_id", "room id must be a UUID"))?;

    let update = UpdateRoom {
        name: body.name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
        sort_order: body.sort_order,
    };

    if update.name.is_none() && update.sort_order.is_none() {
        return Err(ApiError::bad_request(
            "empty_patch",
            "provide name and/or sortOrder",
        ));
    }

    let conn = state
        .db
        .get()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let room = conn
        .interact(move |conn| {
            diesel::update(rooms::table.filter(rooms::id.eq(room_id)))
                .set(update)
                .returning(Room::as_returning())
                .get_result::<Room>(conn)
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(|e| match e {
            diesel::result::Error::NotFound => {
                ApiError::not_found("room_not_found", "room not found")
            }
            other => ApiError::internal(other.to_string()),
        })?;

    Ok(Json(RoomResource::from(&room)))
}

pub async fn delete_room(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<axum::http::StatusCode> {
    let room_id = Uuid::parse_str(&id)
        .map_err(|_| ApiError::bad_request("invalid_id", "room id must be a UUID"))?;

    let conn = state
        .db
        .get()
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?;
    let deleted = conn
        .interact(move |conn| {
            diesel::delete(rooms::table.filter(rooms::id.eq(room_id))).execute(conn)
        })
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(|e| ApiError::internal(e.to_string()))?;

    if deleted == 0 {
        return Err(ApiError::not_found("room_not_found", "room not found"));
    }

    Ok(axum::http::StatusCode::NO_CONTENT)
}
