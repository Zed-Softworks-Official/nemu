import type { ConnectionStatus } from '@nemu/protocol'

/** LAN or Relay reaches the Controller right now. */
export function isConnected(status: ConnectionStatus): boolean {
    return status.mode === 'lan' || status.mode === 'relay'
}

/** What the Controller or the connection said went wrong. */
export function errorMessage(cause: unknown, fallback: string): string {
    return cause instanceof Error && cause.message ? cause.message : fallback
}
