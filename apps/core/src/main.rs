use std::sync::Arc;

use deadpool_diesel::postgres::{Manager, Pool, Runtime};
use dotenvy::dotenv;
use tokio::sync::broadcast;
use tracing::{info, level_filters::LevelFilter};
use tracing_subscriber::EnvFilter;

mod api;
mod commands;
mod config;
mod db;
mod devices;
mod events;
mod mqtt;
mod state;

use config::Config;
use devices::{DeviceRegistry, StateCache};
use mqtt::{create_client, spawn_mqtt_loop};
use state::{AppState, HealthFlags};

#[tokio::main]
async fn main() {
    dotenv().ok();
    init_tracing();

    let config = Config::from_env();
    info!(listen = %config.listen_addr, mqtt = %format!("{}:{}", config.mqtt_host, config.mqtt_port), "starting nemu-core");

    let manager = Manager::new(config.database_url.clone(), Runtime::Tokio1);
    let pool = Pool::builder(manager)
        .max_size(16)
        .build()
        .expect("failed to create database pool");

    // Verify DB connectivity at boot.
    {
        let conn = pool.get().await.expect("failed to get db connection");
        conn.interact(|conn| {
            use diesel::prelude::*;
            diesel::sql_query("SELECT 1").execute(conn)
        })
        .await
        .expect("db interact failed")
        .expect("db ping failed");
        info!("database pool ready");
    }

    let registry = Arc::new(DeviceRegistry::new());
    if let Err(e) = registry.load_from_db(&pool).await {
        tracing::warn!(error = %e, "failed to preload device registry from db");
    }

    let (mqtt_handle, eventloop) = create_client(&config);
    let (events, _) = broadcast::channel(512);

    let state = AppState {
        db: pool,
        registry,
        state_cache: Arc::new(StateCache::new()),
        mqtt: mqtt_handle,
        events,
        health: Arc::new(HealthFlags::default()),
    };

    spawn_mqtt_loop(state.clone(), eventloop);

    let app = api::router::router(state);
    let listener = tokio::net::TcpListener::bind(&config.listen_addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {}: {e}", config.listen_addr));

    info!(addr = %config.listen_addr, "http listening");
    axum::serve(listener, app).await.expect("server error");
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"))
        .add_directive(LevelFilter::INFO.into());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();
}
