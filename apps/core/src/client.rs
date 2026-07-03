use axum::{Error, Router};
use diesel::prelude::*;
use std::env;

use crate::api;

pub struct NemuClient {
    http_router: Router,
    db_conn: PgConnection,
}

impl NemuClient {
    pub fn new() -> Self {
        let conn = establish_connection();
        println!("DB: Connection established");

        Self {
            http_router: api::router::create_router(),
            db_conn: conn,
        }
    }

    pub async fn serve_http(&self) -> Result<(), Error> {
        let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
        axum::serve(listener, self.http_router.clone())
            .await
            .unwrap();
        Ok(())
    }
}

fn establish_connection() -> PgConnection {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}
