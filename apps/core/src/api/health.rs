use axum::Json;
use axum::extract::State;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub mqtt: bool,
    pub zigbee: bool,
    pub db: bool,
}

pub async fn health_check(State(state): State<AppState>) -> Json<HealthResponse> {
    let db_ok = check_db(&state).await;
    let mqtt = state.health.mqtt();
    let zigbee = state.health.zigbee();
    let status = if db_ok && mqtt {
        "ok"
    } else if db_ok {
        "degraded"
    } else {
        "error"
    };

    Json(HealthResponse {
        status: status.to_string(),
        mqtt,
        zigbee,
        db: db_ok,
    })
}

async fn check_db(state: &AppState) -> bool {
    let Ok(conn) = state.db.get().await else {
        return false;
    };
    conn.interact(|conn| {
        use diesel::prelude::*;
        diesel::sql_query("SELECT 1").execute(conn)
    })
    .await
    .ok()
    .and_then(|r| r.ok())
    .is_some()
}
