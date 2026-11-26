import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConvexReactClient } from 'convex/react'
import { mintSessionViaRelay, type SessionMintApi } from './pairing.ts'
import { createMemoryCredentialStore } from './storage.ts'

const MINT_API = {
    request: 'sessionMints:request',
    responses: 'relay:responses',
    acknowledge: 'relay:acknowledge',
} as unknown as SessionMintApi

function mintMailbox(
    answer: (requestId: string) => unknown,
    acknowledge?: () => void
) {
    let requestId: string | undefined
    const acks: string[][] = []
    const convex = {
        mutation: async (ref: unknown, args: Record<string, unknown>) => {
            if (ref === MINT_API.acknowledge) {
                acks.push(args.messageIds as string[])
                acknowledge?.()
                return null
            }
            requestId = args.requestId as string
            return 'request-id'
        },
        query: async () =>
            requestId
                ? [
                      {
                          _id: 'msg-0',
                          requestId,
                          direction: 'toClient',
                          payload: JSON.stringify({
                              requestId,
                              signature: 'sig',
                              message: answer(requestId),
                          }),
                      },
                  ]
                : [],
    } as unknown as ConvexReactClient
    return { convex, acks }
}

const until = async (condition: () => boolean) => {
    const started = Date.now()
    while (!condition()) {
        if (Date.now() - started > 1_000) throw new Error('timed out')
        await new Promise((resolve) => setTimeout(resolve, 1))
    }
}

describe('Session mint over Relay', () => {
    it('acknowledges the minted session response once it has it', async () => {
        const { convex, acks } = mintMailbox(() => ({
            type: 'sessionMintResult',
            clientToken: 'token-a',
            controllerId: 'home-a',
        }))
        const credentialStore = createMemoryCredentialStore({})
        const result = await mintSessionViaRelay({
            convex,
            api: MINT_API,
            controllerId: 'home-a',
            clientLabel: 'Test',
            pollIntervalMs: 1,
            credentialStore,
        })
        assert.equal(result.clientToken, 'token-a')
        await until(() => acks.length > 0)
        assert.deepEqual(acks, [['msg-0']])
    })

    it('acknowledges a refusal too, and keeps its error', async () => {
        const { convex, acks } = mintMailbox(() => ({
            type: 'commandResult',
            ok: false,
            error: { code: 'forbidden', message: 'Not a Member' },
        }))
        await assert.rejects(
            mintSessionViaRelay({
                convex,
                api: MINT_API,
                controllerId: 'home-a',
                clientLabel: 'Test',
                pollIntervalMs: 1,
                credentialStore: createMemoryCredentialStore({}),
            }),
            /Not a Member/
        )
        await until(() => acks.length > 0)
        assert.deepEqual(acks, [['msg-0']])
    })

    it('ignores a failing acknowledge', async () => {
        const { convex } = mintMailbox(
            () => ({
                type: 'sessionMintResult',
                clientToken: 'token-a',
                controllerId: 'home-a',
            }),
            () => {
                throw new Error('offline')
            }
        )
        const result = await mintSessionViaRelay({
            convex,
            api: MINT_API,
            controllerId: 'home-a',
            clientLabel: 'Test',
            pollIntervalMs: 1,
            credentialStore: createMemoryCredentialStore({}),
        })
        assert.equal(result.clientToken, 'token-a')
    })
})
