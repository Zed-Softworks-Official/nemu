// Privacy check (NEM-131): a sealed Relay envelope has room for routing
// metadata and opaque sealed parts only. A bearer token, a Local session or
// an Access grant cannot ride along in the clear, because every envelope
// schema refuses fields it does not name.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    sealedPushSchema,
    sealedRequestSchema,
    sealedResponseSchema,
} from './envelope.ts'

const header = {
    controllerId: 'nemu_1',
    identityEpoch: 1,
    accessClientId: 'ac-1',
    requestId: 'req-1',
}
const envelopes = {
    request: {
        schema: sealedRequestSchema,
        value: {
            header: { ...header, counter: 1, expiresAt: 1_800_000_000_000 },
            enc: 'ZW5j',
            ciphertext: 'Y3Q',
            signature: 'c2ln',
        },
    },
    response: {
        schema: sealedResponseSchema,
        value: { header, ciphertext: 'Y3Q', signature: 'c2ln' },
    },
    push: {
        schema: sealedPushSchema,
        value: {
            header: { ...header, counter: 1 },
            ciphertext: 'Y3Q',
            signature: 'c2ln',
        },
    },
}
const credentialFields = [
    'clientToken',
    'token',
    'authorization',
    'session',
    'grant',
    'signingSecret',
]

describe('Sealed Relay envelopes carry no credential', () => {
    for (const [kind, { schema, value }] of Object.entries(envelopes)) {
        it(`a ${kind} names only routing metadata and sealed parts`, () => {
            assert.equal(schema.safeParse(value).success, true)
            for (const field of credentialFields) {
                assert.equal(
                    schema.safeParse({ ...value, [field]: 'secret' }).success,
                    false,
                    `${kind}.${field}`
                )
                assert.equal(
                    schema.safeParse({
                        ...value,
                        header: { ...value.header, [field]: 'secret' },
                    }).success,
                    false,
                    `${kind}.header.${field}`
                )
            }
        })
    }
})
