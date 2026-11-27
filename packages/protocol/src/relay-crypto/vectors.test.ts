// Seam 1 (NEM-63): the shared wire vectors. This suite rebuilds every vector
// and opens every fixture; Core's `relay_crypto::vectors` does the same in
// Rust. To regenerate the fixture after a deliberate wire change, run
// `NEMU_WRITE_VECTORS=1 pnpm test`, then `pnpm exec biome format --write
// testdata`, then Core's `cargo test relay_crypto`.

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ed25519 } from '@noble/curves/ed25519.js'

import { buildRelayCryptoVectors } from './build-vectors.ts'
import { hexDecode, hexEncode, utf8Decode, utf8Encode } from './bytes.ts'
import {
    CpaceError,
    CpaceInitiator,
    CpaceResponder,
    calculateGenerator,
    generatorString,
    iskIr,
    type PartyKeys,
    scalarMult,
    scalarMultVfy,
    sidOutputIr,
} from './cpace.ts'
import {
    type AccessClientStatus,
    openPush,
    openRequest,
    openResponse,
    RelayCryptoError,
    type RequestHeader,
    type RequestKeys,
    replyKeys,
    type SealedPush,
    type SealedRequest,
    type SealedResponse,
    sealPush,
    sealRequest,
    sealResponse,
} from './envelope.ts'
import { GrantError, issueGrant, verifyGrant } from './grant.ts'
import {
    acceptableEncryptionKey,
    deriveKeyPair,
    setupBaseReceiver,
    setupBaseSender,
} from './hpke.ts'
import {
    ProjectionError,
    signMembershipProjection,
    supersedesProjection,
    verifyMembershipProjection,
} from './projection.ts'
import {
    acceptCounter,
    EMPTY_REPLAY_WINDOW,
    type ReplayWindow,
} from './replay.ts'
import {
    signLanRefusal,
    signLocalSessionChallenge,
    verifyLanRefusal,
    verifyLocalSessionChallenge,
} from './session.ts'
import {
    acceptableSigningKey,
    ed25519Signer,
    ed25519Verify,
} from './signing.ts'

const FIXTURE_URL = new URL(
    '../../../testdata/relay-crypto/vectors.json',
    import.meta.url
)

type Vectors = Awaited<ReturnType<typeof buildRelayCryptoVectors>>

const built = JSON.parse(
    JSON.stringify(await buildRelayCryptoVectors())
) as Vectors
if (process.env.NEMU_WRITE_VECTORS === '1') {
    writeFileSync(FIXTURE_URL, `${JSON.stringify(built, null, 4)}\n`)
}
const fixture = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as Vectors
const h = hexDecode
const { controller, accessClient, impostor } = fixture.keys

function keysOf(p: typeof controller): PartyKeys {
    return {
        signingKey: h(p.signingPublic),
        encryptionKey: h(p.encryptionPublic),
    }
}

function requestByName(name: string) {
    const request = fixture.requests.find((r) => r.name === name)
    assert.ok(request, `no request vector named ${name}`)
    const keys: RequestKeys = {
        responseKey: h(request.responseKey),
        pushKey: h(request.pushKey),
    }
    return { ...request, header: request.sealed.header as RequestHeader, keys }
}

function windowAfter(counters: number[]): ReplayWindow {
    let window = EMPTY_REPLAY_WINDOW
    for (const counter of counters) {
        const result = acceptCounter(window, counter)
        assert.ok(result.ok)
        window = result.window
    }
    return window
}

function errorCode(fn: () => unknown): string {
    try {
        fn()
    } catch (error) {
        if (
            error instanceof RelayCryptoError ||
            error instanceof GrantError ||
            error instanceof ProjectionError ||
            error instanceof CpaceError
        ) {
            return error.code
        }
        throw error
    }
    assert.fail('expected a rejection')
}

describe('wire vector fixture', () => {
    it('is exactly what the TypeScript builder produces', () => {
        assert.deepEqual(built, fixture)
    })
})

describe('HPKE (RFC 9180 A.2.1)', () => {
    const v = fixture.hpkeRfc9180

    it('derives the recipient key pair', () => {
        const pair = deriveKeyPair(h(v.ikmR))
        assert.equal(hexEncode(pair.secretKey), v.skRm)
        assert.equal(hexEncode(pair.publicKey), v.pkRm)
    })

    it('seals every listed sequence number and exports every value', () => {
        const { enc, context } = setupBaseSender(
            h(v.pkRm),
            h(v.info),
            h(v.ikmE)
        )
        assert.equal(hexEncode(enc), v.enc)
        const receiver = setupBaseReceiver(enc, h(v.skRm), h(v.info))
        const bySeq = new Map(v.encryptions.map((e) => [e.seq, e]))
        const last = Math.max(...bySeq.keys())
        for (let seq = 0; seq <= last; seq++) {
            const expected = bySeq.get(seq)
            const pt = expected ? h(expected.pt) : utf8Encode('filler')
            const aad = expected ? h(expected.aad) : new Uint8Array()
            const ct = context.seal(aad, pt)
            assert.deepEqual(receiver.open(aad, ct), pt)
            if (expected) assert.equal(hexEncode(ct), expected.ct)
        }
        for (const e of v.exports) {
            assert.equal(
                hexEncode(context.export(h(e.context), e.length)),
                e.value
            )
        }
    })
})

describe('CPace (draft-irtf-cfrg-cpace-21 B.3)', () => {
    const v = fixture.cpaceDraft

    it('matches the generator, shares, K, ISK and session id', () => {
        assert.equal(
            hexEncode(generatorString(h(v.prs), h(v.ci), h(v.sid))),
            v.generatorString
        )
        const g = calculateGenerator(h(v.prs), h(v.ci), h(v.sid))
        assert.equal(hexEncode(g.toBytes()), v.generator)
        assert.equal(hexEncode(scalarMult(h(v.ya), g)), v.Ya)
        assert.equal(hexEncode(scalarMult(h(v.yb), g)), v.Yb)
        assert.equal(
            hexEncode(scalarMultVfy(h(v.ya), h(v.Yb)) ?? new Uint8Array()),
            v.K
        )
        assert.equal(
            hexEncode(scalarMultVfy(h(v.yb), h(v.Ya)) ?? new Uint8Array()),
            v.K
        )
        assert.equal(
            hexEncode(
                iskIr(h(v.sid), h(v.K), h(v.Ya), h(v.adA), h(v.Yb), h(v.adB))
            ),
            v.iskIr
        )
        assert.equal(
            hexEncode(sidOutputIr(h(v.Ya), h(v.adA), h(v.Yb), h(v.adB))),
            v.sidOutputIr
        )
        assert.equal(
            hexEncode(
                scalarMultVfy(h(v.scalarMult.s), h(v.scalarMult.X)) ??
                    new Uint8Array()
            ),
            v.scalarMult.result
        )
    })

    it('returns the neutral element for invalid points', () => {
        for (const point of v.invalidPoints) {
            assert.equal(scalarMultVfy(h(v.scalarMult.s), h(point)), null)
        }
    })
})

describe('pairing', () => {
    const v = fixture.pairing.accepted
    const ctx = { code: v.code, controllerId: v.controllerId, sid: h(v.sid) }

    it('produces the transcript and confirms both directions', () => {
        const initiator = new CpaceInitiator(
            ctx,
            keysOf(accessClient),
            h(v.initiatorScalar)
        )
        assert.equal(hexEncode(initiator.message.ya), v.ya)
        assert.equal(hexEncode(initiator.message.adA), v.adA)
        const responder = new CpaceResponder(
            ctx,
            keysOf(controller),
            initiator.message,
            h(v.responderScalar)
        )
        assert.equal(hexEncode(responder.message.yb), v.yb)
        assert.equal(hexEncode(responder.message.adB), v.adB)
        assert.equal(hexEncode(responder.message.tagB), v.tagB)
        const a = initiator.finish(responder.message)
        assert.equal(hexEncode(a.tagA), v.tagA)
        assert.equal(hexEncode(a.isk), v.isk)
        assert.deepEqual(a.controllerKeys, keysOf(controller))
        const b = responder.confirm(a.tagA)
        assert.deepEqual(b.accessClientKeys, keysOf(accessClient))
        assert.equal(hexEncode(b.isk), v.isk)
    })

    for (const r of fixture.pairing.rejections.initiator) {
        it(`the Access Client rejects: ${r.name}`, () => {
            const initiator = new CpaceInitiator(
                ctx,
                keysOf(accessClient),
                h(v.initiatorScalar)
            )
            const reply = { yb: h(r.yb), adB: h(r.adB), tagB: h(r.tagB) }
            assert.equal(
                errorCode(() => initiator.finish(reply)),
                r.expectedError
            )
        })
    }

    for (const r of fixture.pairing.rejections.responder) {
        it(`the Controller rejects: ${r.name}`, () => {
            const msg = { ya: h(r.ya), adA: h(r.adA) }
            assert.equal(
                errorCode(
                    () =>
                        new CpaceResponder(
                            ctx,
                            keysOf(controller),
                            msg,
                            h(v.responderScalar)
                        )
                ),
                r.expectedError
            )
        })
    }

    for (const r of fixture.pairing.rejections.confirmation) {
        it(`the Controller refuses confirmation: ${r.name}`, () => {
            const responder = new CpaceResponder(
                ctx,
                keysOf(controller),
                { ya: h(r.ya), adA: h(r.adA) },
                h(v.responderScalar)
            )
            assert.equal(
                errorCode(() => responder.confirm(h(r.tagA))),
                r.expectedError
            )
        })
    }
})

function lookupFor(state: string): (id: string) => AccessClientStatus {
    return (id) => {
        assert.equal(id, 'ac_7f3a')
        if (state === 'active') {
            return {
                status: 'active',
                signingKey: h(accessClient.signingPublic),
            }
        }
        return { status: state as 'tombstoned' | 'unknown' }
    }
}

const POLICY = {
    controllerId: fixture.pairing.accepted.controllerId,
    identityEpoch: fixture.requests[0]?.sealed.header.identityEpoch ?? 0,
    nowMs: (fixture.requests[0]?.sealed.header.expiresAt ?? 0) - 20_000,
}

describe('sealed requests', () => {
    for (const v of fixture.requests) {
        it(`seals and opens: ${v.name}`, async () => {
            const sealedTo = v.sealedTo === 'impostor' ? impostor : controller
            const { sealed, keys } = await sealRequest({
                header: v.sealed.header,
                plaintext: utf8Encode(v.plaintext),
                controllerEncryptionKey: h(sealedTo.encryptionPublic),
                accessClientSigner: ed25519Signer(
                    h(accessClient.signingSecret)
                ),
                ikmE: h(v.ikmE),
            })
            assert.deepEqual(sealed, v.sealed)
            assert.equal(hexEncode(keys.responseKey), v.responseKey)
            assert.equal(hexEncode(keys.pushKey), v.pushKey)
            if (v.sealedTo !== 'controller') return
            const opened = openRequest({
                sealed: v.sealed as SealedRequest,
                controllerEncryptionSecret: h(controller.encryptionSecret),
                policy: POLICY,
                lookup: lookupFor('active'),
                window: EMPTY_REPLAY_WINDOW,
            })
            assert.equal(utf8Decode(opened.plaintext), v.plaintext)
            assert.deepEqual(opened.keys, keys)
            assert.equal(opened.window.highest, v.sealed.header.counter)
            // A refusal is sealed to the same keys without opening.
            assert.deepEqual(
                replyKeys({
                    sealed: v.sealed as SealedRequest,
                    controllerEncryptionSecret: h(controller.encryptionSecret),
                }),
                keys
            )
        })
    }

    for (const r of fixture.rejections.requests) {
        it(`the Controller rejects a request ${r.name}`, () => {
            assert.equal(
                errorCode(() =>
                    openRequest({
                        sealed: r.sealed as SealedRequest,
                        controllerEncryptionSecret: h(
                            controller.encryptionSecret
                        ),
                        policy: r.policy,
                        lookup: lookupFor(r.accessClient),
                        window: windowAfter(r.acceptedCounters),
                    })
                ),
                r.expectedError
            )
        })
    }
})

describe('sealed responses', () => {
    const controllerSigner = ed25519Signer(h(controller.signingSecret))

    for (const v of fixture.responses) {
        it(`seals and opens: ${v.name}`, async () => {
            const request = requestByName(v.request)
            const sealed = await sealResponse({
                request: request.sealed as SealedRequest,
                keys: request.keys,
                plaintext: utf8Encode(v.plaintext),
                controllerSigner,
            })
            assert.deepEqual(sealed, v.sealed)
            const plaintext = openResponse({
                sealed: v.sealed,
                request: request.sealed as SealedRequest,
                keys: request.keys,
                controllerSigningKey: h(controller.signingPublic),
            })
            assert.equal(utf8Decode(plaintext), v.plaintext)
        })
    }

    for (const r of fixture.rejections.responses) {
        it(`the Access Client rejects a response ${r.name}`, () => {
            const request = requestByName(r.request)
            assert.equal(
                errorCode(() =>
                    openResponse({
                        sealed: r.sealed as SealedResponse,
                        request: request.sealed as SealedRequest,
                        keys: request.keys,
                        controllerSigningKey: h(controller.signingPublic),
                    })
                ),
                r.expectedError
            )
        })
    }
})

describe('sealed pushes', () => {
    const controllerSigner = ed25519Signer(h(controller.signingSecret))

    it('seals and opens every push in order', async () => {
        let window = EMPTY_REPLAY_WINDOW
        for (const v of fixture.pushes) {
            const watch = requestByName(v.request)
            const sealed = await sealPush({
                watch: watch.header,
                keys: watch.keys,
                counter: v.counter,
                plaintext: utf8Encode(v.plaintext),
                controllerSigner,
            })
            assert.deepEqual(sealed, v.sealed)
            const opened = openPush({
                sealed: v.sealed,
                watch: watch.header,
                keys: watch.keys,
                controllerSigningKey: h(controller.signingPublic),
                window,
            })
            assert.equal(utf8Decode(opened.plaintext), v.plaintext)
            window = opened.window
        }
    })

    for (const r of fixture.rejections.pushes) {
        it(`the Access Client rejects a push ${r.name}`, () => {
            const watch = requestByName(r.request)
            assert.equal(
                errorCode(() =>
                    openPush({
                        sealed: r.sealed as SealedPush,
                        watch: watch.header,
                        keys: watch.keys,
                        controllerSigningKey: h(controller.signingPublic),
                        window: windowAfter(r.acceptedCounters),
                    })
                ),
                r.expectedError
            )
        })
    }
})

describe('Access grants', () => {
    for (const v of fixture.grants) {
        it(`issues and verifies: ${v.name}`, async () => {
            const grant = {
                ...v.grant,
                signingKey: h(v.grant.signingKey),
                encryptionKey: h(v.grant.encryptionKey),
            }
            const jws = await issueGrant(
                grant,
                ed25519Signer(h(controller.signingSecret))
            )
            assert.equal(jws, v.jws)
            assert.deepEqual(
                verifyGrant(
                    v.jws,
                    v.grant.controllerId,
                    h(controller.signingPublic)
                ),
                grant
            )
        })
    }

    for (const r of fixture.rejections.grants) {
        it(`rejects a grant ${r.name}`, () => {
            assert.equal(
                errorCode(() =>
                    verifyGrant(
                        r.jws,
                        fixture.pairing.accepted.controllerId,
                        h(controller.signingPublic)
                    )
                ),
                r.expectedError
            )
        })
    }
})

describe('Membership routing projections', () => {
    for (const v of fixture.membershipProjections) {
        it(`signs and verifies: ${v.name}`, async () => {
            const signed = await signMembershipProjection(
                v.signed.projection as never,
                ed25519Signer(h(controller.signingSecret))
            )
            assert.deepEqual(signed, v.signed)
            assert.deepEqual(
                verifyMembershipProjection(
                    v.signed,
                    v.signed.projection.controllerId,
                    h(controller.signingPublic)
                ),
                v.signed.projection
            )
        })
    }

    for (const r of fixture.rejections.membershipProjections) {
        it(`rejects a projection ${r.name}`, () => {
            assert.equal(
                errorCode(() =>
                    verifyMembershipProjection(
                        r.signed,
                        fixture.pairing.accepted.controllerId,
                        h(controller.signingPublic)
                    )
                ),
                r.expectedError
            )
        })
    }

    it('orders by identity epoch, then sequence', () => {
        const at = (identityEpoch: number, sequence: number) => ({
            identityEpoch,
            sequence,
        })
        assert.ok(supersedesProjection(at(1, 1), null))
        assert.ok(supersedesProjection(at(1, 2), at(1, 1)))
        assert.ok(!supersedesProjection(at(1, 1), at(1, 1)))
        assert.ok(!supersedesProjection(at(1, 1), at(1, 2)))
        // A restore bumps the epoch and may rewind the outbox.
        assert.ok(supersedesProjection(at(2, 1), at(1, 90)))
        assert.ok(!supersedesProjection(at(1, 90), at(2, 1)))
    })
})

describe('Ed25519 and X25519 edge cases, refused as Core refuses them', () => {
    for (const v of fixture.ed25519.weakSigningKeys) {
        it(`refuses a signing key ${v.name}`, () => {
            assert.equal(acceptableSigningKey(h(v.bytes)), false)
        })
    }
    for (const v of fixture.ed25519.weakEncryptionKeys) {
        it(`refuses an encryption key: ${v.name}`, () => {
            assert.equal(acceptableEncryptionKey(h(v.bytes)), false)
        })
    }
    it('accepts the vector parties’ own keys', () => {
        for (const party of [controller, accessClient]) {
            assert.ok(acceptableSigningKey(h(party.signingPublic)))
            assert.ok(acceptableEncryptionKey(h(party.encryptionPublic)))
        }
    })
    it('refuses a signature only a cofactored verifier accepts', () => {
        const v = fixture.ed25519.cofactoredOnly
        const args = [h(v.signature), h(v.message), h(v.signer)] as const
        // noble's own check is cofactored, so the vector really is the edge.
        assert.equal(ed25519.verify(...args, { zip215: false }), true)
        assert.equal(
            ed25519Verify(h(v.signer), h(v.message), h(v.signature)),
            false
        )
    })
})

describe('LAN pair-again refusals', () => {
    const refusal = (v: {
        controllerId: string
        accessClientId: string
        code: string
        clientNonce: string
    }) => ({
        controllerId: v.controllerId,
        accessClientId: v.accessClientId,
        code: v.code,
        clientNonce: h(v.clientNonce),
    })

    for (const v of fixture.lanRefusals) {
        it(`signs and verifies: ${v.name}`, async () => {
            const signature = await signLanRefusal(
                ed25519Signer(h(controller.signingSecret)),
                refusal(v)
            )
            assert.equal(hexEncode(signature), v.signature)
            assert.ok(
                verifyLanRefusal(
                    h(controller.signingPublic),
                    refusal(v),
                    h(v.signature)
                )
            )
        })
    }

    for (const r of fixture.rejections.lanRefusals) {
        it(`rejects a refusal ${r.name}`, () => {
            assert.equal(
                verifyLanRefusal(
                    h(controller.signingPublic),
                    refusal(r),
                    h(r.signature)
                ),
                false
            )
        })
    }
})

describe('Local session challenges', () => {
    const challenge = (v: {
        controllerId: string
        accessClientId: string
        nonce: string
    }) => ({
        controllerId: v.controllerId,
        accessClientId: v.accessClientId,
        nonce: h(v.nonce),
    })

    for (const v of fixture.localSessions) {
        it(`signs and verifies: ${v.name}`, async () => {
            const signature = await signLocalSessionChallenge(
                ed25519Signer(h(accessClient.signingSecret)),
                challenge(v)
            )
            assert.equal(hexEncode(signature), v.signature)
            assert.ok(
                verifyLocalSessionChallenge(
                    h(accessClient.signingPublic),
                    challenge(v),
                    h(v.signature)
                )
            )
        })
    }

    for (const r of fixture.rejections.localSessions) {
        it(`rejects a challenge signed ${r.name}`, () => {
            assert.equal(
                verifyLocalSessionChallenge(
                    h(accessClient.signingPublic),
                    challenge(r),
                    h(r.signature)
                ),
                false
            )
        })
    }
})

describe('replay window', () => {
    for (const v of fixture.replayWindow) {
        it(v.name, () => {
            let window = EMPTY_REPLAY_WINDOW
            for (const [counter, expected] of v.steps as [number, string][]) {
                const result = acceptCounter(window, counter)
                assert.equal(
                    result.ok ? 'accepted' : result.reason,
                    expected,
                    `counter ${counter}`
                )
                if (result.ok) window = result.window
            }
        })
    }
})
