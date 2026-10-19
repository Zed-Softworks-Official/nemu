use std::time::Duration;

use chrono::Utc;
use tracing::warn;

use crate::state::DbPool;

pub fn spawn(pool: DbPool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        let mut history_cleanup = false;
        loop {
            interval.tick().await;
            let now = Utc::now();
            if let Err(error) = crate::ledger::sweep(&pool, now).await {
                warn!(%error, "command ledger sweep failed");
            }
            if let Err(error) = crate::audit::sweep(&pool, now).await {
                warn!(%error, "audit retention sweep failed");
            }
            // Diagnostic partitions go before any product History cleanup.
            if let Err(error) = crate::diagnostics::prune_before_history(&pool, now).await {
                warn!(%error, "diagnostic retention sweep failed");
            }
            match crate::capabilities::sweep_history_budget(&pool, now, history_cleanup).await {
                Ok(still_running) => history_cleanup = still_running,
                Err(error) => warn!(%error, "history budget sweep failed"),
            }
        }
    });
}
