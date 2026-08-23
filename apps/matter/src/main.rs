use tracing::info;

use nemu_matter::config::Config;
use nemu_matter::mqtt;
use nemu_matter::service::MatterService;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    info!(
        mqtt = %format!("{}:{}", config.mqtt_host, config.mqtt_port),
        topic = %config.mqtt_base_topic,
        data = %config.data_dir.display(),
        "starting nemu-matter"
    );

    let (mqtt, incoming) = mqtt::start(&config);
    let service = MatterService::start(config, mqtt).await?;
    service.run(incoming).await;
    Ok(())
}
