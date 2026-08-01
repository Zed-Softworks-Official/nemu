use std::sync::Arc;

use deadpool_diesel::postgres::{Manager, Pool, Runtime};
use dotenvy::dotenv;
use tokio::sync::broadcast;
use tracing::{info, level_filters::LevelFilter, warn};
use tracing_subscriber::EnvFilter;

mod api;
mod commands;
mod config;
mod crypto;
mod db;
mod devices;
mod events;
mod identity;
mod mqtt;
mod pairing;
mod registration;
mod relay;
mod state;

use config::Config;
use devices::{DeviceRegistry, StateCache};
use identity::load_or_create_identity;
use mqtt::{create_client, spawn_mqtt_loop};
use pairing::codes::mint_pairing_code;
use pairing::tokens::count_client_tokens;
use registration::register_with_retry;
use relay::client::spawn_relay_loop;
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

    let identity = load_or_create_identity(&pool, &config.controller_name)
        .await
        .expect("failed to load controller identity");
    info!(
        controller_id = %identity.controller_id,
        name = %identity.name,
        "controller identity ready"
    );

    if let Some(site_url) = &config.convex_site_url {
        register_with_retry(
            site_url,
            &identity,
            config.registration_secret.as_deref(),
        )
        .await;
    } else {
        warn!("NEMU_CONVEX_SITE_URL unset; skipping Convex registration");
    }

    // First-run bootstrap: mint a pairing code and print it when nobody is paired yet.
    match count_client_tokens(&pool).await {
        Ok(0) => match mint_pairing_code(&pool).await {
            Ok(code) => {
                info!("================================================");
                info!("No paired clients yet. Pairing code: {}", code.code);
                info!("Expires at: {}", code.expires_at);
                info!("================================================");
            }
            Err(e) => warn!(error = %e, "failed to mint bootstrap pairing code"),
        },
        Ok(_) => {}
        Err(e) => warn!(error = %e, "failed to count client tokens"),
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
        identity: Arc::new(identity),
        convex_site_url: config.convex_site_url.clone(),
        registration_secret: config.registration_secret.clone(),
    };

    spawn_mqtt_loop(state.clone(), eventloop);
    spawn_relay_loop(state.clone());

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
