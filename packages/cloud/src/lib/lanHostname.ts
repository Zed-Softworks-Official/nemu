/** Public LAN hostname: {controllerId with _ → -}.lan.{zone} */
export function lanHostnameFor(
    controllerId: string,
    zone = process.env.NEMU_LAN_ZONE ?? 'nemu.sh'
): string {
    const label = controllerId.replaceAll('_', '-')
    return `${label}.lan.${zone}`
}

/** Vercel record name on the apex zone (e.g. nemu-abc.lan for nemu-abc.lan.nemu.sh). */
export function vercelRecordName(hostname: string, zone: string): string {
    const suffix = `.${zone}`
    if (hostname.endsWith(suffix)) {
        return hostname.slice(0, -suffix.length)
    }
    return hostname
}

export function isRfc1918Ipv4(ip: string): boolean {
    const parts = ip.split('.').map((part) => Number(part))
    if (
        parts.length !== 4 ||
        parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    ) {
        return false
    }
    const [a, b] = parts
    if (a === undefined || b === undefined) return false
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    return false
}

/** Docker bridge; prefer a real LAN address when both exist. */
export function isDockerBridgeIpv4(ip: string): boolean {
    const parts = ip.split('.').map((part) => Number(part))
    return parts[0] === 172 && parts[1] === 17
}
