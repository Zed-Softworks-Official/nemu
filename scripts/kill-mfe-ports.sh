#!/usr/bin/env bash
# Free microfrontend dev ports before starting turbo (avoids "Port is not available").
set -euo pipefail

for port in 3000 3001 3024; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Stopping process(es) on port $port: $pids"
        kill $pids 2>/dev/null || true
        sleep 0.2
        kill -9 $pids 2>/dev/null || true
    fi
done
