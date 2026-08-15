use axum::extract::Query;
use axum::http::Uri;
use axum::response::Html;
use serde::Deserialize;

const DASHBOARD_SETUP: &str = "https://app.nemu.sh/setup";

#[derive(Debug, Deserialize)]
pub struct LandingQuery {
    next: Option<String>,
}

pub async fn landing(Query(query): Query<LandingQuery>) -> Html<String> {
    let next = query
        .next
        .as_deref()
        .and_then(sanitize_return_url)
        .unwrap_or_else(|| DASHBOARD_SETUP.to_string());
    Html(landing_html(&next))
}

fn sanitize_return_url(raw: &str) -> Option<String> {
    let uri: Uri = raw.parse().ok()?;
    let scheme = uri.scheme_str()?;
    let host = uri.host()?;
    let allowed = matches!(
        (scheme, host),
        ("https", "app.nemu.sh" | "dashboard.nemu.sh")
            | ("http" | "https", "localhost" | "127.0.0.1")
    );
    if !allowed {
        return None;
    }
    let path = uri.path();
    if path != "/setup" && path != "/setup/" {
        return None;
    }

    let authority = match uri.port_u16() {
        Some(port) if !is_default_port(scheme, port) => format!("{host}:{port}"),
        _ => host.to_string(),
    };
    Some(format!("{scheme}://{authority}/setup?trusted=1"))
}

fn is_default_port(scheme: &str, port: u16) -> bool {
    (scheme == "http" && port == 80) || (scheme == "https" && port == 443)
}

fn landing_html(next: &str) -> String {
    let next_js = serde_json::to_string(next).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url={next_escaped}">
  <title>Nemu</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5;color:#111">
  <h1>Returning to Nemu</h1>
  <p>This browser now trusts the controller. Taking you back to the dashboard…</p>
  <p><a href="{next_escaped}">Continue</a></p>
  <script>
    (function () {{
      var next = {next_js};
      try {{
        if (window.opener) {{
          window.opener.postMessage({{ type: "nemu-tls-trusted" }}, new URL(next).origin);
          window.close();
        }}
      }} catch (e) {{}}
      location.replace(next);
    }})();
  </script>
</body>
</html>
"#,
        next_escaped = html_escape(next),
        next_js = next_js
    )
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
