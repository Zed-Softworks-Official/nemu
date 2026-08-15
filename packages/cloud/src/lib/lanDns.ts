/**
 * Vercel DNS helpers for {id}.lan.nemu.sh A/TXT records.
 * Used only from Node actions (ACME + register issuance).
 */

export type VercelRecord = {
    id: string
    name: string
    type: string
    value: string
}

function zone(): string {
    return process.env.NEMU_LAN_ZONE ?? 'nemu.sh'
}

function teamQuery(prefix = '?'): string {
    const teamId = process.env.VERCEL_TEAM_ID
    return teamId ? `${prefix}teamId=${encodeURIComponent(teamId)}` : ''
}

function authHeaders(): HeadersInit {
    const token = process.env.VERCEL_TOKEN
    if (!token) {
        throw new Error('VERCEL_TOKEN is not set')
    }
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

export function vercelConfigured(): boolean {
    return Boolean(process.env.VERCEL_TOKEN)
}

function namesMatch(recordName: string, expected: string): boolean {
    const normalized = recordName.replace(/\.$/, '')
    const z = zone()
    return normalized === expected || normalized === `${expected}.${z}`
}

async function listRecords(): Promise<VercelRecord[]> {
    const domain = zone()
    const team = teamQuery()
    const qs = team ? `${team}&limit=100` : '?limit=100'
    const response = await fetch(
        `https://api.vercel.com/v4/domains/${encodeURIComponent(domain)}/records${qs}`,
        { headers: authHeaders() }
    )
    if (!response.ok) {
        throw new Error(`Vercel list records failed (${response.status})`)
    }
    const body = (await response.json()) as { records?: VercelRecord[] }
    return body.records ?? []
}

async function createRecord(
    name: string,
    type: 'A' | 'TXT',
    value: string
): Promise<void> {
    const domain = zone()
    const response = await fetch(
        `https://api.vercel.com/v2/domains/${encodeURIComponent(domain)}/records${teamQuery()}`,
        {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name, type, value, ttl: 60 }),
        }
    )
    if (!response.ok) {
        const text = await response.text()
        throw new Error(
            `Vercel create ${type} ${name} failed (${response.status}): ${text}`
        )
    }
}

async function deleteRecord(id: string): Promise<void> {
    const domain = zone()
    const response = await fetch(
        `https://api.vercel.com/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(id)}${teamQuery()}`,
        { method: 'DELETE', headers: authHeaders() }
    )
    if (!response.ok && response.status !== 404) {
        throw new Error(`Vercel delete record failed (${response.status})`)
    }
}

export async function upsertRecord(
    name: string,
    type: 'A' | 'TXT',
    value: string
): Promise<void> {
    const records = await listRecords()
    const matches = records.filter(
        (record) => namesMatch(record.name, name) && record.type === type
    )
    const already = matches.find((record) => record.value === value)
    if (already) return
    for (const record of matches) {
        await deleteRecord(record.id)
    }
    await createRecord(name, type, value)
}

export async function deleteRecordsByName(
    name: string,
    type: 'A' | 'TXT'
): Promise<void> {
    const records = await listRecords()
    for (const record of records) {
        if (namesMatch(record.name, name) && record.type === type) {
            await deleteRecord(record.id)
        }
    }
}
