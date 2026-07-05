use crate::api;
use axum::{Router, routing::get};
use diesel::PgConnection;

use std::sync::{Arc, Mutex};

pub struct NemuRouter {
    pub raw_router: Router,
    db_conn: Arc<Mutex<PgConnection>>,
}

impl NemuRouter {
    pub fn new(db_conn: Arc<Mutex<PgConnection>>) -> Self {
        Self {
            raw_router: Router::new().route("/api/health", get(api::health::health_check)),
            db_conn,
        }
    }
}
