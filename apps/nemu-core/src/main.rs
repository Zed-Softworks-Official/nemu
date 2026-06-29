use diesel::prelude::*;
use dotenvy::dotenv;
use std::env;

mod db;

fn main() {
    dotenv().ok();

    let _conn = establish_connection();
    println!("Connection established");
}

fn establish_connection() -> PgConnection {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    PgConnection::establish(&database_url)
        .unwrap_or_else(|_| panic!("Error connecting to {}", database_url))
}
