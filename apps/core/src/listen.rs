use std::sync::Arc;

use axum::Router;
use axum::extract::Request;
use hyper::body::Incoming;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto::Builder;
use rustls::ServerConfig;
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::TlsAcceptor;
use tower::Service;
use tracing::{debug, info, warn};

/// Serve HTTP and HTTPS on the same port. A TLS ClientHello (0x16) is accepted
/// as HTTPS; anything else is treated as cleartext HTTP.
pub async fn serve(
    listener: TcpListener,
    app: Router,
    tls: Option<Arc<ServerConfig>>,
) -> Result<(), std::io::Error> {
    let addr = listener.local_addr()?;
    if tls.is_some() {
        info!(%addr, "http+https listening (TLS when the client requests it)");
    } else {
        info!(%addr, "http listening");
    }

    loop {
        let (stream, peer) = listener.accept().await?;
        let app = app.clone();
        let tls = tls.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_connection(stream, app, tls).await {
                debug!(%peer, %error, "connection closed with error");
            }
        });
    }
}

async fn handle_connection(
    stream: TcpStream,
    app: Router,
    tls: Option<Arc<ServerConfig>>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut peek = [0u8; 1];
    let n = stream.peek(&mut peek).await?;
    if n == 0 {
        return Ok(());
    }

    if peek[0] == 0x16 {
        let Some(config) = tls else {
            warn!("TLS ClientHello received but TLS is disabled");
            return Ok(());
        };
        let tls_stream = TlsAcceptor::from(config).accept(stream).await?;
        serve_http(tls_stream, app).await
    } else {
        serve_http(stream, app).await
    }
}

async fn serve_http<S>(
    stream: S,
    app: Router,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let io = TokioIo::new(stream);
    let service = hyper::service::service_fn(move |req: Request<Incoming>| {
        let mut app = app.clone();
        async move { app.call(req).await }
    });

    Builder::new(TokioExecutor::new())
        .serve_connection_with_upgrades(io, service)
        .await?;
    Ok(())
}
