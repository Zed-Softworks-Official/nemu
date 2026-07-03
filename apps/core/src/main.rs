use diesel::prelude::*;
use dotenvy::dotenv;
use std::env;

mod api;
mod db;

#[tokio::main]
async fn main() {
    dotenv().ok();

    let _conn = establish_connection();
    println!("Connection established");

    let router = api::router::create_router();
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, router).await.unwrap();
}

fn establish_connection() -> PgConnection {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}
