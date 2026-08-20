use std::sync::Arc;

use deadpool_diesel::postgres::{Manager, Pool, Runtime};
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use dotenvy::dotenv;
use tokio::sync::broadcast;
use tracing::{info, level_filters::LevelFilter, warn};
use tracing_subscriber::EnvFilter;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

mod api;
mod commands;
mod config;
mod crypto;
mod db;
mod devices;
mod events;
mod identity;
mod listen;
mod mqtt;
mod pairing;
mod registration;
mod relay;
mod state;
mod tls;
mod tls_sync;
mod watchtower;

use config::Config;
use devices::{DeviceRegistry, StateCache};
use identity::load_or_create_identity;
use mqtt::{create_client, spawn_mqtt_loop};
use pairing::codes::mint_pairing_code;
use pairing::tokens::count_client_tokens;
use registration::register_with_retry;
use relay::client::spawn_relay_loop;
use state::{AppState, HealthFlags};
use watchtower::WatchtowerClient;

#[tokio::main]
async fn main() {
    dotenv().ok();
    init_tracing();

    let config = Config::from_env();
    let bridges = config
        .bridges
        .iter()
        .map(|bridge| format!("{}:{}", bridge.protocol, bridge.base_topic))
        .collect::<Vec<_>>()
        .join(", ");
    info!(listen = %config.listen_addr, mqtt = %format!("{}:{}", config.mqtt_host, config.mqtt_port), %bridges, "starting nemu-core");

    let manager = Manager::new(config.database_url.clone(), Runtime::Tokio1);
    let pool = Pool::builder(manager)
        .max_size(16)
        .build()
        .expect("failed to create database pool");

    // Run pending Diesel migrations, then verify connectivity.
    {
        let conn = pool.get().await.expect("failed to get db connection");
        conn.interact(|conn| {
            conn.run_pending_migrations(MIGRATIONS)
                .map_err(|e| e.to_string())?;
            use diesel::prelude::*;
            diesel::sql_query("SELECT 1")
                .execute(conn)
                .map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })
        .await
        .expect("db interact failed")
        .expect("db migrate/ping failed");
        info!("database migrations applied; pool ready");
    }

    let identity = load_or_create_identity(&pool, &config.controller_name)
        .await
        .expect("failed to load controller identity");
    info!(
        controller_id = %identity.controller_id,
        name = %identity.name,
        "controller identity ready"
    );

    let lan_ip = tls::detect_lan_ipv4(&config.tls_extra_sans);
    if let Some(ip) = &lan_ip {
        info!(lan_ip = %ip, "detected LAN IPv4 for trusted hostname");
    }

    if let Some(site_url) = &config.convex_site_url {
        register_with_retry(
            site_url,
            &identity,
            config.registration_secret.as_deref(),
            lan_ip.as_deref(),
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
        lan_ip: lan_ip.clone(),
        watchtower: match (
            config.watchtower_url.clone(),
            config.watchtower_token.clone(),
        ) {
            (Some(url), Some(token)) => Some(WatchtowerClient::new(
                url,
                token,
                config.watchtower_image.clone(),
            )),
            _ => None,
        },
    };

    spawn_mqtt_loop(state.clone(), eventloop);
    spawn_relay_loop(state.clone());

    let initial_tls = if config.tls_enabled {
        match tls::load_server_config(
            &state.db,
            config.tls_cert_path.as_deref(),
            config.tls_key_path.as_deref(),
            &config.tls_extra_sans,
        )
        .await
        {
            Ok(material) => Some(material.config),
            Err(error) => {
                warn!(%error, "failed to enable TLS; serving HTTP only");
                None
            }
        }
    } else {
        tls::warn_if_disabled();
        None
    };
    let shared_tls: listen::SharedTls = std::sync::Arc::new(std::sync::RwLock::new(initial_tls));
    let operator_files = config.tls_cert_path.is_some();
    if config.tls_enabled {
        tls_sync::spawn_tls_sync(state.clone(), shared_tls.clone(), operator_files);
    }

    let app = api::router::router(state);
    let listener = tokio::net::TcpListener::bind(&config.listen_addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {}: {e}", config.listen_addr));

    listen::serve(listener, app, shared_tls)
        .await
        .expect("server error");
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
