#!/usr/bin/env bash
# Free standalone Next.js dev ports before starting turbo (avoids "Port is not available").
set -euo pipefail

for port in 3000 3001; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping process(es) on port $port: $pids"
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
        sleep 0.2
        # shellcheck disable=SC2086
        kill -9 $pids 2>/dev/null || true
    fi
done
