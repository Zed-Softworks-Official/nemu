#!/usr/bin/env bash
# Shared cleanup for nemu-core dev processes (cargo-watch, cargo run, binary, listen port).
# Source from dev wrappers; safe to call multiple times.

stop_nemu_core() {
  local listen_port="${NEMU_LISTEN_PORT:-6368}"

  pkill -TERM -f '[c]argo-watch watch' 2>/dev/null || true
  pkill -TERM -f '[c]argo run.*--package=nemu' 2>/dev/null || true
  pkill -TERM -f 'target/(debug|release)/nemu([[:space:]]|$)' 2>/dev/null || true

  sleep 0.15

  pkill -KILL -f 'target/(debug|release)/nemu([[:space:]]|$)' 2>/dev/null || true

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${listen_port}/tcp" 2>/dev/null || true
  fi
}
