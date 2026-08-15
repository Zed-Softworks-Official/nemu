use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, UdpSocket};
use std::sync::Arc;

use rustls::ServerConfig;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use tracing::{info, warn};

use crate::identity::{get_string, set_string};
use crate::state::DbPool;

const KEY_TLS_CERT: &str = "tls_cert_pem";
const KEY_TLS_KEY: &str = "tls_key_pem";
const KEY_TLS_SAN: &str = "tls_san";
const KEY_TLS_LE_CERT: &str = "tls_le_cert_pem";
const KEY_TLS_LE_KEY: &str = "tls_le_key_pem";
const KEY_LAN_HOSTNAME: &str = "tls_lan_hostname";

pub struct TlsMaterial {
    pub config: Arc<ServerConfig>,
}

pub async fn load_server_config(
    pool: &DbPool,
    cert_path: Option<&str>,
    key_path: Option<&str>,
    extra_sans: &[String],
) -> Result<TlsMaterial, String> {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let (cert_pem, key_pem) = match (cert_path, key_path) {
        (Some(cert), Some(key)) => (
            std::fs::read_to_string(cert)
                .map_err(|e| format!("failed to read NEMU_TLS_CERT_PATH: {e}"))?,
            std::fs::read_to_string(key)
                .map_err(|e| format!("failed to read NEMU_TLS_KEY_PATH: {e}"))?,
        ),
        (Some(_), None) | (None, Some(_)) => {
            return Err(
                "NEMU_TLS_CERT_PATH and NEMU_TLS_KEY_PATH must be set together".into(),
            );
        }
        (None, None) => match load_issued_pems(pool).await? {
            Some((cert, key)) => {
                info!("loaded Let's Encrypt TLS certificate");
                (cert, key)
            }
            None => load_or_create_self_signed(pool, extra_sans).await?,
        },
    };

    let config = server_config_from_pem(&cert_pem, &key_pem)?;
    Ok(TlsMaterial {
        config: Arc::new(config),
    })
}

async fn load_or_create_self_signed(
    pool: &DbPool,
    extra_sans: &[String],
) -> Result<(String, String), String> {
    let extra_sans = extra_sans.to_vec();
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;

    conn.interact(move |conn| {
        let san_fingerprint = extra_sans.join(",");
        let existing_cert = get_string(conn, KEY_TLS_CERT)?;
        let existing_key = get_string(conn, KEY_TLS_KEY)?;
        let existing_san = get_string(conn, KEY_TLS_SAN)?;
        if let (Some(cert), Some(key)) = (existing_cert, existing_key) {
            if existing_san.as_deref().unwrap_or("") == san_fingerprint {
                info!("loaded persisted TLS certificate");
                return Ok((cert, key));
            }
        }

        let (cert, key) = generate_self_signed(&extra_sans)?;
        set_string(conn, KEY_TLS_CERT, &cert)?;
        set_string(conn, KEY_TLS_KEY, &key)?;
        set_string(conn, KEY_TLS_SAN, &san_fingerprint)?;
        info!("generated self-signed TLS certificate for LAN HTTPS");
        Ok((cert, key))
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

fn generate_self_signed(extra_sans: &[String]) -> Result<(String, String), String> {
    let mut params = rcgen::CertificateParams::new(Vec::<String>::new())
        .map_err(|e| format!("tls params: {e}"))?;
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "nemu.local");
    params.subject_alt_names = default_sans(extra_sans);

    let key_pair = rcgen::KeyPair::generate().map_err(|e| format!("tls key: {e}"))?;
    let cert = params
        .self_signed(&key_pair)
        .map_err(|e| format!("tls cert: {e}"))?;

    Ok((cert.pem(), key_pair.serialize_pem()))
}

fn default_sans(extra_sans: &[String]) -> Vec<rcgen::SanType> {
    let mut sans = vec![
        dns_san("nemu.local"),
        dns_san("localhost"),
        rcgen::SanType::IpAddress(IpAddr::V4(Ipv4Addr::LOCALHOST)),
        rcgen::SanType::IpAddress(IpAddr::V6(Ipv6Addr::LOCALHOST)),
    ];

    for host in extra_sans {
        if let Ok(ip) = host.parse::<IpAddr>() {
            sans.push(rcgen::SanType::IpAddress(ip));
        } else {
            sans.push(dns_san(host));
        }
    }

    if let Some(ip) = guess_outbound_ip() {
        if !matches!(ip, IpAddr::V4(v) if v.is_loopback())
            && !matches!(ip, IpAddr::V6(v) if v.is_loopback())
        {
            sans.push(rcgen::SanType::IpAddress(ip));
        }
    }

    sans
}

fn dns_san(name: &str) -> rcgen::SanType {
    match name.to_string().try_into() {
        Ok(ia5) => rcgen::SanType::DnsName(ia5),
        Err(_) => rcgen::SanType::DnsName(
            "nemu.local"
                .to_string()
                .try_into()
                .expect("nemu.local is a valid DNS SAN"),
        ),
    }
}

fn guess_outbound_ip() -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("1.1.1.1:80").ok()?;
    Some(socket.local_addr().ok()?.ip())
}

pub fn server_config_from_pem(cert_pem: &str, key_pem: &str) -> Result<ServerConfig, String> {
    let mut cert_reader = cert_pem.as_bytes();
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cert_reader)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("invalid TLS cert PEM: {e}"))?;
    if certs.is_empty() {
        return Err("TLS cert PEM contained no certificates".into());
    }

    let mut key_reader = key_pem.as_bytes();
    let key: PrivateKeyDer<'static> = rustls_pemfile::private_key(&mut key_reader)
        .map_err(|e| format!("invalid TLS key PEM: {e}"))?
        .ok_or_else(|| "TLS key PEM contained no private key".to_string())?;

    let mut config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| format!("invalid TLS material: {e}"))?;
    // HTTP/1.1 only — WebSocket upgrades are not used with h2.
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(config)
}

pub fn warn_if_disabled() {
    warn!("NEMU_TLS=0; serving HTTP only (HTTPS dashboard cannot open LAN WebSockets)");
}

pub fn is_rfc1918_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 10 || (a == 192 && b == 168) || (a == 172 && (16..=31).contains(&b))
}

fn is_docker_bridge_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    a == 172 && b == 17
}

fn lan_ip_preference(ip: Ipv4Addr) -> u8 {
    let [a, b, ..] = ip.octets();
    if a == 192 && b == 168 {
        0
    } else if a == 10 {
        1
    } else if is_docker_bridge_ipv4(ip) {
        3
    } else if a == 172 && (16..=31).contains(&b) {
        2
    } else {
        4
    }
}

/// Prefer a real home LAN address over Docker's 172.17 bridge.
pub fn detect_lan_ipv4(extra_sans: &[String]) -> Option<String> {
    let mut candidates: Vec<Ipv4Addr> = extra_sans
        .iter()
        .filter_map(|value| value.parse::<Ipv4Addr>().ok())
        .filter(|ip| is_rfc1918_ipv4(*ip))
        .collect();

    if let Some(IpAddr::V4(ip)) = guess_outbound_ip() {
        if is_rfc1918_ipv4(ip) {
            candidates.push(ip);
        }
    }

    candidates.sort_by_key(|ip| lan_ip_preference(*ip));
    candidates.first().map(ToString::to_string)
}

pub async fn load_issued_pems(pool: &DbPool) -> Result<Option<(String, String)>, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    conn.interact(|conn| {
        let cert = get_string(conn, KEY_TLS_LE_CERT)?;
        let key = get_string(conn, KEY_TLS_LE_KEY)?;
        Ok(match (cert, key) {
            (Some(cert), Some(key)) => Some((cert, key)),
            _ => None,
        })
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn persist_issued_tls(
    pool: &DbPool,
    cert_pem: &str,
    key_pem: &str,
    hostname: &str,
) -> Result<(), String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let cert_pem = cert_pem.to_string();
    let key_pem = key_pem.to_string();
    let hostname = hostname.to_string();
    conn.interact(move |conn| {
        set_string(conn, KEY_TLS_LE_CERT, &cert_pem)?;
        set_string(conn, KEY_TLS_LE_KEY, &key_pem)?;
        set_string(conn, KEY_LAN_HOSTNAME, &hostname)?;
        Ok(())
    })
    .await
    .map_err(|e| format!("db interact error: {e}"))?
}

pub async fn current_lan_hostname(pool: &DbPool) -> Option<String> {
    let conn = pool.get().await.ok()?;
    conn.interact(|conn| get_string(conn, KEY_LAN_HOSTNAME))
        .await
        .ok()?
        .ok()?
}
