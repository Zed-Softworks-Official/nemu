use client::NemuClient;
use dotenvy::dotenv;

mod api;
mod client;
mod db;

#[tokio::main]
async fn main() {
    dotenv().ok();

    let client = NemuClient::new();
    client.serve_http().await.unwrap();
}
