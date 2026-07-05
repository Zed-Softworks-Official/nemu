use axum::Error;
use diesel::prelude::*;
use std::{
    env,
    sync::{Arc, Mutex},
};

use crate::api::router::NemuRouter;

pub struct NemuClient {
    http_router: NemuRouter,
}

impl NemuClient {
    pub fn new() -> Self {
        let db_conn = Arc::new(Mutex::new(establish_db_connection()));
        println!("DB: Connection established");

        Self {
            http_router: NemuRouter::new(db_conn),
        }
    }

    pub async fn serve_http(&self) -> Result<(), Error> {
        let listener = tokio::net::TcpListener::bind("0.0.0.0:6368").await.unwrap();
        axum::serve(listener, self.http_router.raw_router.clone())
            .await
            .unwrap();
        Ok(())
    }
}

fn establish_db_connection() -> PgConnection {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}
