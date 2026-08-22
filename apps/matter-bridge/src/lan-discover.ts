/**
 * Find a Matter device that just joined this LAN. After BLE sends Wi-Fi
 * credentials, matterjs often reconnects to a stale IP (e.g. 192.168.1.80)
 * while the strip is actually on the controller's subnet. Neighbor entries
 * give us the real IPv4 so we can finish commissioning with `ip_addr`.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type LanHost = {
    ip: string
    prefix: number
    dev: string
    via?: string
}

export type Neighbor = {
    ip: string
    mac?: string
    dev: string
    state: string
    live: boolean
}

export function parseDefaultRoute(text: string): {
    dev: string
    src?: string
    via?: string
} | null {
    const line = text.split('\n').find((row) => row.startsWith('default '))
    if (line === undefined) return null
    const dev = matchToken(line, 'dev')
    if (dev === undefined) return null
    return {
        dev,
        src: matchToken(line, 'src'),
        via: matchToken(line, 'via'),
    }
}

export function parseIpv4Addr(
    text: string
): { ip: string; prefix: number } | null {
    const match = text.match(/\binet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/)
    const ip = match?.[1]
    const prefix = Number.parseInt(match?.[2] ?? '', 10)
    if (ip === undefined || !Number.isInteger(prefix)) return null
    return { ip, prefix }
}

export function parseNeigh(text: string): Neighbor[] {
    const neighbors: Neighbor[] = []
    for (const line of text.split('\n')) {
        const ip = line.match(/^(\d+\.\d+\.\d+\.\d+)\s/)?.[1]
        if (ip === undefined) continue
        if (/\bFAILED\b/.test(line)) continue
        const mac = line.match(/\blladdr\s+([0-9a-fA-F:]+)/)?.[1]
        const dev = matchToken(line, 'dev') ?? ''
        const state =
            line.match(
                /\b(REACHABLE|STALE|DELAY|PROBE|PERMANENT|INCOMPLETE)\b/
            )?.[1] ?? 'UNKNOWN'
        neighbors.push({
            ip,
            mac: mac?.toLowerCase(),
            dev,
            state,
            live: isLiveNeighState(state),
        })
    }
    return neighbors
}

export function ipv4OnSubnet(
    ip: string,
    networkIp: string,
    prefix: number
): boolean {
    const address = ipv4ToInt(ip)
    const network = ipv4ToInt(networkIp)
    if (address === undefined || network === undefined) return false
    if (prefix <= 0) return true
    if (prefix >= 32) return address === network
    const mask = (0xffff_ffff << (32 - prefix)) >>> 0
    return (address & mask) === (network & mask)
}

export async function hostLanInfo(): Promise<LanHost | null> {
    try {
        const route = parseDefaultRoute(
            (await execFileAsync('ip', ['-4', 'route', 'show', 'default']))
                .stdout
        )
        if (!route) return null
        const addr = parseIpv4Addr(
            (
                await execFileAsync('ip', [
                    '-4',
                    'addr',
                    'show',
                    'dev',
                    route.dev,
                ])
            ).stdout
        )
        if (!addr) return null
        return {
            ip: addr.ip,
            prefix: addr.prefix,
            dev: route.dev,
            via: route.via,
        }
    } catch {
        return null
    }
}

export async function listLanNeighborRecords(
    host: LanHost,
    options: { liveOnly?: boolean } = {}
): Promise<Neighbor[]> {
    const liveOnly = options.liveOnly ?? true
    try {
        const { stdout } = await execFileAsync('ip', [
            '-4',
            'neigh',
            'show',
            'dev',
            host.dev,
        ])
        return parseNeigh(stdout).filter((neighbor) => {
            if (neighbor.ip === host.ip) return false
            if (liveOnly && !neighbor.live) return false
            return ipv4OnSubnet(neighbor.ip, host.ip, host.prefix)
        })
    } catch {
        return []
    }
}

export async function listLanNeighbors(
    host: LanHost,
    options: { liveOnly?: boolean } = {}
): Promise<string[]> {
    return [
        ...new Set(
            (await listLanNeighborRecords(host, options)).map(
                (neighbor) => neighbor.ip
            )
        ),
    ]
}

export function ipv4Addresses(addresses: readonly string[]): string[] {
    const ips: string[] = []
    for (const address of addresses) {
        const ip = address.split('%')[0]
        if (
            ip !== undefined &&
            /^\d+\.\d+\.\d+\.\d+$/.test(ip) &&
            !ips.includes(ip)
        ) {
            ips.push(ip)
        }
    }
    return ips
}

export function macsFromText(text: string): string[] {
    const macs: string[] = []
    for (const match of text.matchAll(
        /\b([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})\b/g
    )) {
        const mac = match[1]?.toLowerCase()
        if (mac !== undefined && !macs.includes(mac)) macs.push(mac)
    }
    return macs
}

export function ipsForMacs(
    neighbors: readonly Neighbor[],
    macs: readonly string[]
): string[] {
    const want = new Set(macs.map((mac) => mac.toLowerCase()))
    const ips: string[] = []
    for (const neighbor of neighbors) {
        if (neighbor.mac === undefined || !want.has(neighbor.mac)) continue
        if (!ips.includes(neighbor.ip)) ips.push(neighbor.ip)
    }
    return ips
}

export async function pingReachable(
    ip: string,
    timeoutSec = 1
): Promise<boolean> {
    try {
        await execFileAsync('ping', ['-c', '1', '-W', String(timeoutSec), ip])
        return true
    } catch {
        return false
    }
}

/**
 * Prefer IPv4s that appeared after BLE sent Wi-Fi credentials. If the strip
 * was already a neighbor (same DHCP lease after a reset), fall back to other
 * hosts on this subnet except the controller and its gateway.
 */
export function commissionCandidateIps(
    discovered: readonly string[],
    neighbors: readonly string[],
    host: LanHost,
    limit = 8
): string[] {
    const exclude = new Set<string>([host.ip])
    if (host.via !== undefined) exclude.add(host.via)
    const out: string[] = []
    const add = (ip: string) => {
        if (exclude.has(ip) || out.includes(ip)) return
        if (!ipv4OnSubnet(ip, host.ip, host.prefix)) return
        out.push(ip)
    }
    for (const ip of discovered) add(ip)
    if (out.length === 0) {
        for (const ip of neighbors) add(ip)
    }
    return out.slice(0, limit)
}

export function watchNewLanIps(
    initial: ReadonlySet<string>,
    host: LanHost,
    intervalMs = 2_000
): {
    stop: () => void
    found: () => string[]
    waitForNew: (timeoutMs: number) => Promise<string[]>
} {
    const discovered = new Set<string>()
    let stopped = false
    let timer: ReturnType<typeof setInterval> | undefined

    const poll = async () => {
        if (stopped) return
        for (const ip of await listLanNeighbors(host)) {
            if (!initial.has(ip)) discovered.add(ip)
        }
    }

    timer = setInterval(() => {
        void poll()
    }, intervalMs)
    void poll()

    return {
        stop() {
            stopped = true
            if (timer !== undefined) clearInterval(timer)
        },
        found() {
            return [...discovered]
        },
        async waitForNew(timeoutMs: number) {
            const deadline = Date.now() + timeoutMs
            while (!stopped && Date.now() < deadline) {
                await poll()
                if (discovered.size > 0) return [...discovered]
                await delay(Math.min(intervalMs, deadline - Date.now()))
            }
            return [...discovered]
        },
    }
}

function isLiveNeighState(state: string): boolean {
    return /^(REACHABLE|DELAY|PROBE|PERMANENT)$/i.test(state)
}

function matchToken(line: string, token: string): string | undefined {
    const parts = line.split(/\s+/)
    const index = parts.indexOf(token)
    if (index < 0) return undefined
    return parts[index + 1]
}

function ipv4ToInt(ip: string): number | undefined {
    const parts = ip.split('.')
    if (parts.length !== 4) return undefined
    let value = 0
    for (const part of parts) {
        const octet = Number.parseInt(part, 10)
        if (!Number.isInteger(octet) || octet < 0 || octet > 255)
            return undefined
        value = (value << 8) | octet
    }
    return value >>> 0
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
