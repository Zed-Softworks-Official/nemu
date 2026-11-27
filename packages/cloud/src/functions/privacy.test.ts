// Privacy check (NEM-131): nothing Convex stores can authenticate as an
// Access Client. Access Clients authenticate with private keys that never
// leave the device, through Local sessions the Controller keeps in memory,
// or by signing a sealed Relay request. Bearer tokens are gone, and Convex
// holds no table for them.

import rateLimiter from '@convex-dev/rate-limiter/test'
import {
    b64urlEncode,
    ed25519PublicKey,
    ed25519Signer,
    hexEncode,
    issueGrant,
    openResponse,
    type RequestKeys,
    type SealedRequest,
    sealRequest,
    sealResponse,
    utf8Encode,
    x25519PublicKey,
} from '@nemu/protocol/relay-crypto'
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { CONTROLLER_JWT_ISSUER } from '../lib/controllerAuth'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const CONTROLLER_ID = 'nemu_0123456789abcdef'
const ACCESS_CLIENT_ID = 'access-client-1'
const USER_ID = 'user_2abc'

/**
 * Every field each Convex table may hold. Adding a field means adding it
 * here, which is the point: a credential cannot slip into a table unseen.
 * `controllers.tlsKeyPem` (the LAN certificate key, NEM-122) and
 * `acmeAccounts.accountKeyPem` are Controller and ACME keys; neither
 * authenticates as an Access Client.
 */
const ALLOWED_FIELDS: Record<string, string[]> = {
    controllers: [
        'controllerId',
        'publicKey',
        'name',
        'registeredAt',
        'lanIp',
        'lanHostname',
        'tlsCertPem',
        'tlsKeyPem',
        'tlsExpiresAt',
    ],
    acmeAccounts: ['directoryUrl', 'accountKeyPem'],
    pairings: ['userId', 'controllerId', 'createdAt', 'role'],
    membershipRoutes: [
        'controllerId',
        'identityEpoch',
        'membershipId',
        'accountId',
        'state',
        'sequence',
        'signature',
    ],
    invites: ['controllerId', 'email', 'invitedByUserId', 'createdAt'],
    relayMessages: [
        'kind',
        'controllerId',
        'identityEpoch',
        'accessClientId',
        'requestId',
        'counter',
        'expiresAt',
        'enc',
        'ciphertext',
        'signature',
        'deleteAt',
    ],
}

const CREDENTIAL_NAME = /token|session|grant|password|secret|bearer/i

function tableFields(name: string): string[] {
    const table = schema.tables[name as keyof typeof schema.tables]
    const validator = table.validator as unknown as {
        fields?: Record<string, unknown>
    }
    return Object.keys(validator.fields ?? {})
}

describe('Convex tables', () => {
    test('hold only the fields the privacy rule allows', () => {
        expect(Object.keys(schema.tables).sort()).toEqual(
            Object.keys(ALLOWED_FIELDS).sort()
        )
        for (const [name, allowed] of Object.entries(ALLOWED_FIELDS)) {
            expect(tableFields(name).sort(), name).toEqual([...allowed].sort())
        }
    })

    test('have no field named like a credential', () => {
        for (const name of Object.keys(schema.tables)) {
            for (const field of tableFields(name)) {
                expect(CREDENTIAL_NAME.test(field), `${name}.${field}`).toBe(
                    false
                )
            }
        }
    })

    test('have no session mint functions or table', () => {
        expect(
            Object.keys(modules).some((path) => /sessionMint/.test(path))
        ).toBe(false)
        expect(Object.keys(schema.tables)).not.toContain('sessionMints')
    })
})

describe('A sealed Relay exchange', () => {
    test('leaves nothing in any table that authenticates as an Access Client', async () => {
        const t = convexTest(schema, modules)
        rateLimiter.register(t)
        const client = t.withIdentity({
            subject: USER_ID,
            issuer: 'https://clerk.nemu.test',
        })
        const controller = t.withIdentity({
            subject: CONTROLLER_ID,
            issuer: CONTROLLER_JWT_ISSUER,
        })

        // The Access Client's and Controller's keys. Only public halves are
        // ever given to Convex.
        const signingSecret = new Uint8Array(32).fill(21)
        const encryptionSecret = new Uint8Array(32).fill(22)
        const controllerSigningSecret = new Uint8Array(32).fill(23)
        const controllerEncryptionSecret = new Uint8Array(32).fill(24)
        const controllerSigningKey = ed25519PublicKey(controllerSigningSecret)
        const grant = await issueGrant(
            {
                controllerId: CONTROLLER_ID,
                accessClientId: ACCESS_CLIENT_ID,
                membershipId: 'membership-1',
                signingKey: ed25519PublicKey(signingSecret),
                encryptionKey: x25519PublicKey(encryptionSecret),
                issuedAt: 1_800_000_000,
            },
            ed25519Signer(controllerSigningSecret)
        )
        await t.run(async (ctx) => {
            await ctx.db.insert('controllers', {
                controllerId: CONTROLLER_ID,
                publicKey: b64urlEncode(controllerSigningKey),
                name: 'Home',
                registeredAt: Date.now(),
            })
            await ctx.db.insert('membershipRoutes', {
                controllerId: CONTROLLER_ID,
                identityEpoch: 1,
                membershipId: 'membership-1',
                accountId: USER_ID,
                state: 'active',
                sequence: 1,
                signature: 'signature',
            })
        })

        const header = {
            controllerId: CONTROLLER_ID,
            identityEpoch: 1,
            accessClientId: ACCESS_CLIENT_ID,
            requestId: 'privacy-check',
            counter: 1,
            expiresAt: Date.now() + 20_000,
        }
        const request = JSON.stringify({ type: 'getSession' })
        const { sealed, keys } = await sealRequest({
            header,
            plaintext: utf8Encode(request),
            controllerEncryptionKey: x25519PublicKey(
                controllerEncryptionSecret
            ),
            accessClientSigner: ed25519Signer(signingSecret),
        })
        await client.mutation(api.relay.send, { sealed })
        // The response deletes the request, so look at the mailbox both
        // while the request waits and after it is answered.
        const whileWaiting = await everyRow(t)

        const pending = (await controller.query(
            api.relay.pendingForMe,
            {}
        )) as SealedRequest[]
        expect(pending).toHaveLength(1)
        const reply = JSON.stringify({ type: 'session', role: 'owner' })
        const response = await sealResponse({
            request: sealed,
            keys,
            plaintext: utf8Encode(reply),
            controllerSigner: ed25519Signer(controllerSigningSecret),
        })
        await controller.mutation(api.relay.respondAsController, {
            sealed: response,
        })
        const answered = await client.query(api.relay.responses, {
            controllerId: CONTROLLER_ID,
            accessClientId: ACCESS_CLIENT_ID,
            requestIds: [header.requestId],
        })
        expect(answered).toHaveLength(1)
        const [delivered] = answered
        if (!delivered) throw new Error('no response')
        // The client still reads its reply: the check below is not vacuous.
        expect(
            new TextDecoder().decode(
                openResponse({
                    sealed: delivered.sealed as typeof response,
                    request: sealed,
                    keys,
                    controllerSigningKey,
                })
            )
        ).toBe(reply)

        const stored = whileWaiting + (await everyRow(t))
        expect(stored).toContain(sealed.ciphertext)
        expect(stored).toContain(response.ciphertext)

        const secrets: Array<[string, Uint8Array | string]> = [
            ['Access Client signing key', signingSecret],
            ['Access Client encryption key', encryptionSecret],
            ['Controller signing key', controllerSigningSecret],
            ['Controller encryption key', controllerEncryptionSecret],
            ...responseKeys(keys),
        ]
        for (const [label, secret] of secrets) {
            for (const encoded of encodings(secret)) {
                expect(stored.includes(encoded), label).toBe(false)
            }
        }
        for (const [label, text] of [
            ['Access grant', grant],
            ['request plaintext', request],
            ['reply plaintext', reply],
        ] as const) {
            expect(stored.includes(text), label).toBe(false)
        }
        expect(
            CREDENTIAL_NAME.test(
                fieldNames(JSON.parse(whileWaiting)) +
                    fieldNames(JSON.parse(await everyRow(t)))
            )
        ).toBe(false)
    })
})

async function everyRow(t: ReturnType<typeof convexTest>): Promise<string> {
    return await t.run(async (ctx) => {
        const rows: unknown[] = []
        for (const name of Object.keys(schema.tables)) {
            rows.push(
                ...(await ctx.db
                    .query(name as keyof typeof schema.tables)
                    .collect())
            )
        }
        return JSON.stringify(rows)
    })
}

function responseKeys(keys: RequestKeys): Array<[string, Uint8Array]> {
    return [
        ['response key', keys.responseKey],
        ['push key', keys.pushKey],
    ]
}

function encodings(secret: Uint8Array | string): string[] {
    if (typeof secret === 'string') return [secret]
    return [
        b64urlEncode(secret),
        btoa(String.fromCharCode(...secret)),
        hexEncode(secret),
    ]
}

function fieldNames(value: unknown): string {
    if (Array.isArray(value)) return value.map(fieldNames).join(' ')
    if (value && typeof value === 'object') {
        return Object.entries(value)
            .map(([key, inner]) => `${key} ${fieldNames(inner)}`)
            .join(' ')
    }
    return ''
}
