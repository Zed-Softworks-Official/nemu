// Builds the shared Relay crypto wire vectors from fixed keys and nonces.
// `vectors.test.ts` checks that this output equals
// `testdata/relay-crypto/vectors.json`, and regenerates the file when run
// with NEMU_WRITE_VECTORS=1. Core's tests rebuild every case from the same
// inputs and must produce the same bytes.

import { sha256 } from '@noble/hashes/sha2.js'

import { b64urlEncode, hexDecode, hexEncode, utf8Encode } from './bytes.ts'
import {
    CpaceInitiator,
    CpaceResponder,
    confirmationTag,
    controllerAssociatedData,
    iskIr,
    type PairingContext,
    type PartyKeys,
    scalarMultVfy,
} from './cpace.ts'
import {
    type RequestHeader,
    type RequestKeys,
    type SealedRequest,
    sealPush,
    sealRequest,
    sealResponse,
} from './envelope.ts'
import { type AccessGrant, issueGrant } from './grant.ts'
import { x25519PublicKey } from './hpke.ts'
import { signLocalSessionChallenge } from './session.ts'
import { ed25519PublicKey, ed25519Signer } from './signing.ts'

/** Deterministic 32 bytes for a vector input. */
function seed(name: string): Uint8Array {
    return sha256(utf8Encode(`nemu-relay-vectors/${name}`))
}

/** A CPace scalar with the bits above 252 cleared, as `sample_scalar` does. */
function scalar(name: string): Uint8Array {
    const bytes = seed(name)
    bytes[31] = (bytes[31] ?? 0) & 0x0f
    return bytes
}

function party(name: string) {
    const signingSecret = seed(`${name}/ed25519`)
    const encryptionSecret = seed(`${name}/x25519`)
    return {
        signingSecret: hexEncode(signingSecret),
        signingPublic: hexEncode(ed25519PublicKey(signingSecret)),
        encryptionSecret: hexEncode(encryptionSecret),
        encryptionPublic: hexEncode(x25519PublicKey(encryptionSecret)),
    }
}

type Party = ReturnType<typeof party>

function publicKeys(p: Party): PartyKeys {
    return {
        signingKey: hexDecode(p.signingPublic),
        encryptionKey: hexDecode(p.encryptionPublic),
    }
}

function signer(p: Party) {
    return ed25519Signer(hexDecode(p.signingSecret))
}

function keysJson(keys: RequestKeys) {
    return {
        responseKey: hexEncode(keys.responseKey),
        pushKey: hexEncode(keys.pushKey),
    }
}

/** RFC 9180 appendix A.2.1 (base mode, this suite). */
const HPKE_RFC9180 = {
    info: '4f6465206f6e2061204772656369616e2055726e',
    ikmE: '909a9b35d3dc4713a5e72a4da274b55d3d3821a37e5d099e74a647db583a904b',
    ikmR: '1ac01f181fdf9f352797655161c58b75c656a6cc2716dcb66372da835542e1df',
    skRm: '8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb',
    pkRm: '4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a',
    enc: '1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a',
    encryptions: [
        {
            seq: 0,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d30',
            ct: '1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28',
        },
        {
            seq: 1,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d31',
            ct: '6b53c051e4199c518de79594e1c4ab18b96f081549d45ce015be002090bb119e85285337cc95ba5f59992dc98c',
        },
        {
            seq: 2,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d32',
            ct: '71146bd6795ccc9c49ce25dda112a48f202ad220559502cef1f34271e0cb4b02b4f10ecac6f48c32f878fae86b',
        },
        {
            seq: 4,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d34',
            ct: '63357a2aa291f5a4e5f27db6baa2af8cf77427c7c1a909e0b37214dd47db122bb153495ff0b02e9e54a50dbe16',
        },
        {
            seq: 255,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d323535',
            ct: '18ab939d63ddec9f6ac2b60d61d36a7375d2070c9b683861110757062c52b8880a5f6b3936da9cd6c23ef2a95c',
        },
        {
            seq: 256,
            pt: '4265617574792069732074727574682c20747275746820626561757479',
            aad: '436f756e742d323536',
            ct: '7a4a13e9ef23978e2c520fd4d2e757514ae160cd0cd05e556ef692370ca53076214c0c40d4c728d6ed9e727a5b',
        },
    ],
    exports: [
        {
            context: '',
            length: 32,
            value: '4bbd6243b8bb54cec311fac9df81841b6fd61f56538a775e7c80a9f40160606e',
        },
        {
            context: '00',
            length: 32,
            value: '8c1df14732580e5501b00f82b10a1647b40713191b7c1240ac80e2b68808ba69',
        },
        {
            context: '54657374436f6e74657874',
            length: 32,
            value: '5acb09211139c43b3090489a9da433e8a30ee7188ba8b0a9a1ccf0c229283e53',
        },
    ],
}

const NON_CANONICAL_POINT =
    '2b3c6b8c4f3800e7aef6864025b4ed79bd599117e427c41bd47d93d654b4a51c'
const IDENTITY_POINT = '00'.repeat(32)

/** draft-irtf-cfrg-cpace-21 appendix B.3 (ristretto255, SHA-512). */
const CPACE_DRAFT = {
    prs: '50617373776f7264',
    ci: '0b415f696e69746961746f720b425f726573706f6e646572',
    sid: '7e4b4791d6a8ef019b936c79fb7f2c57',
    generatorString:
        '11435061636552697374726574746f3235350850617373776f726464' +
        '00'.repeat(100) +
        '180b415f696e69746961746f720b425f726573706f6e646572107e4b4791d6a8ef019b936c79fb7f2c57',
    generator:
        '222b6b195fe84b1652badb6f6a3ae3d24341e7306967f0b8115b40d5698c7e56',
    ya: 'da3d23700a9e5699258aef94dc060dfda5ebb61f02a5ea77fad53f4ff0976d08',
    adA: '414461',
    Ya: 'd6bac480f2c386c394efc7c47adb9925dcd2630b64f240c50f8d0eec482b9157',
    yb: 'd2316b454718c35362d83d69df6320f38578ed5984651435e2949762d900b80d',
    adB: '414462',
    Yb: '3ea7e0b19560d7c0b0f5734f63b955286dfa8232b5ebe63324e2d9e7433f7258',
    K: '80b69a8a76457ab6a4d7f887a4bf6b55a2f80ac19c333f917a05fc9887c8b40f',
    iskIr: 'b69effbf61b51d56401c0f65601abe428de8206feaaf0e32198896dcae7b35cd2b38950a39dfd5d4a79164614c2984f7daa460b588c1e80c3fa2068af7900447',
    sidOutputIr:
        'bb1c449b35f0ea79a65c209f329a693d475e0ce2387bed9fe4b78f60b2a27c219813fb2cfe175ef40d2222d9261e66da7d78f7c55a303b1b8611dcdfab880c47',
    scalarMult: {
        s: '7cd0e075fa7955ba52c02759a6c90dbbfc10e6d40aea8d283e407d88cf538a05',
        X: '2c3c6b8c4f3800e7aef6864025b4ed79bd599117e427c41bd47d93d654b4a51c',
        result: '7c13645fe790a468f62c39beb7388e541d8405d1ade69d1778c5fe3e7f6b600e',
    },
    invalidPoints: [NON_CANONICAL_POINT, IDENTITY_POINT],
}

const CONTROLLER_ID = 'nemu_0123456789abcdef'
const NOW_MS = 1_800_000_000_000
const IDENTITY_EPOCH = 3

function pairingVectors(controller: Party, accessClient: Party) {
    const sid = seed('pairing/sid').slice(0, 16)
    const ctx: PairingContext = {
        code: '482019',
        controllerId: CONTROLLER_ID,
        sid,
    }
    const initiatorScalar = scalar('pairing/initiator')
    const responderScalar = scalar('pairing/responder')
    const initiator = new CpaceInitiator(
        ctx,
        publicKeys(accessClient),
        initiatorScalar
    )
    const responder = new CpaceResponder(
        ctx,
        publicKeys(controller),
        initiator.message,
        responderScalar
    )
    const outcome = initiator.finish(responder.message)
    responder.confirm(outcome.tagA)

    const wrongCode = new CpaceResponder(
        { ...ctx, code: '482018' },
        publicKeys(controller),
        initiator.message,
        responderScalar
    )
    const substituted = controllerAssociatedData(publicKeys(accessClient))

    // An Access Client that guessed the wrong code computes its tag from its
    // own view of the run; the Controller must refuse it.
    const guesser = new CpaceInitiator(
        { ...ctx, code: '000000' },
        publicKeys(accessClient),
        initiatorScalar
    )
    const answer = new CpaceResponder(
        ctx,
        publicKeys(controller),
        guesser.message,
        responderScalar
    ).message
    const guessedK = scalarMultVfy(initiatorScalar, answer.yb)
    if (guessedK === null) throw new Error('unexpected identity')
    const guessedTag = confirmationTag(
        sid,
        iskIr(
            sid,
            guessedK,
            guesser.message.ya,
            guesser.message.adA,
            answer.yb,
            answer.adB
        ),
        guesser.message.ya,
        guesser.message.adA
    )

    return {
        accepted: {
            code: ctx.code,
            controllerId: ctx.controllerId,
            sid: hexEncode(sid),
            initiatorScalar: hexEncode(initiatorScalar),
            responderScalar: hexEncode(responderScalar),
            ya: hexEncode(initiator.message.ya),
            adA: hexEncode(initiator.message.adA),
            yb: hexEncode(responder.message.yb),
            adB: hexEncode(responder.message.adB),
            tagB: hexEncode(responder.message.tagB),
            tagA: hexEncode(outcome.tagA),
            isk: hexEncode(outcome.isk),
        },
        rejections: {
            /** The initiator finishes against these replies. */
            initiator: [
                {
                    name: 'the Controller used a different Pairing code',
                    controllerCode: '482018',
                    yb: hexEncode(wrongCode.message.yb),
                    adB: hexEncode(wrongCode.message.adB),
                    tagB: hexEncode(wrongCode.message.tagB),
                    expectedError: 'confirmation_failed',
                },
                {
                    name: 'the Controller keys were substituted in flight',
                    yb: hexEncode(responder.message.yb),
                    adB: hexEncode(substituted),
                    tagB: hexEncode(responder.message.tagB),
                    expectedError: 'confirmation_failed',
                },
                {
                    name: 'the Controller sent the identity element',
                    yb: IDENTITY_POINT,
                    adB: hexEncode(responder.message.adB),
                    tagB: hexEncode(responder.message.tagB),
                    expectedError: 'invalid_point',
                },
            ],
            /** The responder answers these first messages. */
            responder: [
                {
                    name: 'the Access Client sent the identity element',
                    ya: IDENTITY_POINT,
                    adA: hexEncode(initiator.message.adA),
                    expectedError: 'invalid_point',
                },
                {
                    name: 'the Access Client sent a non-canonical encoding',
                    ya: NON_CANONICAL_POINT,
                    adA: hexEncode(initiator.message.adA),
                    expectedError: 'invalid_point',
                },
                {
                    name: 'the Access Client labelled its keys as a Controller',
                    ya: hexEncode(initiator.message.ya),
                    adA: hexEncode(substituted),
                    expectedError: 'invalid_associated_data',
                },
            ],
            /** The responder answers `ya`/`adA`, then checks `tagA`. */
            confirmation: [
                {
                    name: 'the Access Client used a different Pairing code',
                    ya: hexEncode(guesser.message.ya),
                    adA: hexEncode(guesser.message.adA),
                    tagA: hexEncode(guessedTag),
                    expectedError: 'confirmation_failed',
                },
            ],
        },
    }
}

function header(overrides: Partial<RequestHeader> = {}): RequestHeader {
    return {
        controllerId: CONTROLLER_ID,
        identityEpoch: IDENTITY_EPOCH,
        accessClientId: 'ac_7f3a',
        requestId: 'req_0001',
        counter: 1,
        expiresAt: NOW_MS + 20_000,
        ...overrides,
    }
}

async function sealVector(
    name: string,
    requestHeader: RequestHeader,
    plaintext: string,
    controller: Party,
    accessClient: Party
) {
    const ikmE = seed(`request/${name}/ikmE`)
    const { sealed, keys } = await sealRequest({
        header: requestHeader,
        plaintext: utf8Encode(plaintext),
        controllerEncryptionKey: hexDecode(controller.encryptionPublic),
        accessClientSigner: signer(accessClient),
        ikmE,
    })
    return { name, plaintext, ikmE: hexEncode(ikmE), sealed, keys }
}

/** Flips bits in the second-last base64url character, keeping it valid. */
function tamper(text: string): string {
    const replacement = text.at(-2) === 'A' ? 'B' : 'A'
    return `${text.slice(0, -2)}${replacement}${text.at(-1)}`
}

export async function buildRelayCryptoVectors() {
    const controller = party('controller')
    const accessClient = party('access-client')
    const impostor = party('impostor')

    const command = await sealVector(
        'command',
        header(),
        '{"type":"setDeviceState","deviceId":"dev_1","state":{"on":true}}',
        controller,
        accessClient
    )
    const watch = await sealVector(
        'watch',
        header({ requestId: 'req_0002', counter: 2 }),
        '{"type":"watchCapabilityChanges","deviceIds":["dev_1"]}',
        controller,
        accessClient
    )
    const toImpostor = await sealVector(
        'sealed to another Controller key',
        header({ requestId: 'req_0003', counter: 3 }),
        '{"type":"listDevices"}',
        impostor,
        accessClient
    )
    const tamperedHeader: SealedRequest = {
        ...command.sealed,
        header: { ...command.sealed.header, counter: 9 },
    }

    const response = await sealResponse({
        request: command.sealed.header,
        keys: command.keys,
        plaintext: utf8Encode('{"ok":true,"outcome":"accepted"}'),
        controllerSigner: signer(controller),
    })
    const forgedResponse = await sealResponse({
        request: command.sealed.header,
        keys: command.keys,
        plaintext: utf8Encode('{"ok":true,"outcome":"accepted"}'),
        controllerSigner: signer(impostor),
    })
    const pushes = await Promise.all(
        [1, 2].map((counter) =>
            sealPush({
                watch: watch.sealed.header,
                keys: watch.keys,
                counter,
                plaintext: utf8Encode(
                    `{"deviceId":"dev_1","capability":"on","value":${counter === 1}}`
                ),
                controllerSigner: signer(controller),
            })
        )
    )
    const forgedPush = await sealPush({
        watch: watch.sealed.header,
        keys: watch.keys,
        counter: 1,
        plaintext: utf8Encode(
            '{"deviceId":"dev_1","capability":"on","value":true}'
        ),
        controllerSigner: signer(impostor),
    })
    const [push1, push2] = pushes as [
        (typeof pushes)[number],
        (typeof pushes)[number],
    ]

    const grant: AccessGrant = {
        controllerId: CONTROLLER_ID,
        accessClientId: 'ac_7f3a',
        membershipId: 'mem_42',
        signingKey: hexDecode(accessClient.signingPublic),
        encryptionKey: hexDecode(accessClient.encryptionPublic),
        issuedAt: 1_800_000_000,
    }
    const grantJws = await issueGrant(grant, signer(controller))
    const forgedGrant = await issueGrant(grant, signer(impostor))
    const otherControllerGrant = await issueGrant(
        { ...grant, controllerId: 'nemu_fedcba9876543210' },
        signer(controller)
    )
    const [grantHeader, grantPayload, grantSignature] = grantJws.split('.')
    const noneHeader = b64urlEncode(utf8Encode('{"alg":"none","typ":"JWT"}'))

    const sessionChallenge = {
        controllerId: CONTROLLER_ID,
        accessClientId: grant.accessClientId,
        nonce: seed('local-session/nonce'),
    }
    const sessionSignature = await signLocalSessionChallenge(
        signer(accessClient),
        sessionChallenge
    )

    const policy = {
        controllerId: CONTROLLER_ID,
        identityEpoch: IDENTITY_EPOCH,
        nowMs: NOW_MS,
    }

    return {
        description:
            'Shared Relay crypto wire vectors (NEM-125). Generated by packages/protocol/src/relay-crypto/build-vectors.ts; checked by its vectors.test.ts and by Core relay_crypto::vectors. Hex for raw bytes, base64url inside wire objects.',
        hpkeRfc9180: HPKE_RFC9180,
        cpaceDraft: CPACE_DRAFT,
        keys: { controller, accessClient, impostor },
        pairing: pairingVectors(controller, accessClient),
        requests: [command, watch, toImpostor].map((v) => ({
            name: v.name,
            plaintext: v.plaintext,
            ikmE: v.ikmE,
            /** The Controller key the request is sealed to. */
            sealedTo: v === toImpostor ? 'impostor' : 'controller',
            sealed: v.sealed,
            ...keysJson(v.keys),
        })),
        responses: [
            {
                name: 'command outcome',
                request: command.name,
                plaintext: '{"ok":true,"outcome":"accepted"}',
                sealed: response,
            },
        ],
        pushes: [push1, push2].map((sealed, index) => ({
            name: `capability change ${index + 1}`,
            request: watch.name,
            counter: index + 1,
            plaintext: `{"deviceId":"dev_1","capability":"on","value":${index === 0}}`,
            sealed,
        })),
        grants: [
            {
                name: 'Access grant',
                grant: {
                    controllerId: grant.controllerId,
                    accessClientId: grant.accessClientId,
                    membershipId: grant.membershipId,
                    signingKey: hexEncode(grant.signingKey),
                    encryptionKey: hexEncode(grant.encryptionKey),
                    issuedAt: grant.issuedAt,
                },
                jws: grantJws,
            },
        ],
        /** Signed by `keys.accessClient` (NEM-126). */
        localSessions: [
            {
                name: 'Local session challenge',
                controllerId: sessionChallenge.controllerId,
                accessClientId: sessionChallenge.accessClientId,
                nonce: hexEncode(sessionChallenge.nonce),
                signature: hexEncode(sessionSignature),
            },
        ],
        rejections: {
            /** Each must fail verification against `keys.accessClient`. */
            localSessions: [
                {
                    name: 'for another Access Client',
                    controllerId: sessionChallenge.controllerId,
                    accessClientId: 'ac_other',
                    nonce: hexEncode(sessionChallenge.nonce),
                    signature: hexEncode(sessionSignature),
                },
                {
                    name: 'for another Controller',
                    controllerId: 'nemu_fedcba9876543210',
                    accessClientId: sessionChallenge.accessClientId,
                    nonce: hexEncode(sessionChallenge.nonce),
                    signature: hexEncode(sessionSignature),
                },
                {
                    name: 'over another nonce',
                    controllerId: sessionChallenge.controllerId,
                    accessClientId: sessionChallenge.accessClientId,
                    nonce: hexEncode(seed('local-session/other-nonce')),
                    signature: hexEncode(sessionSignature),
                },
            ],
            /**
             * Opened by the Controller with `policy`, its encryption secret,
             * an Access Client in `accessClient` state and a window that has
             * accepted `acceptedCounters`.
             */
            requests: [
                {
                    name: 'addressed to another Home',
                    sealed: command.sealed,
                    policy: {
                        ...policy,
                        controllerId: 'nemu_fedcba9876543210',
                    },
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'wrong_controller',
                },
                {
                    name: 'addressed to a retired identity epoch',
                    sealed: command.sealed,
                    policy: { ...policy, identityEpoch: IDENTITY_EPOCH + 1 },
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'retired_epoch',
                },
                {
                    name: 'expired beyond the allowed clock skew',
                    sealed: command.sealed,
                    policy: { ...policy, nowMs: NOW_MS + 20_000 + 60_001 },
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'expired',
                },
                {
                    name: 'from an unknown Access Client',
                    sealed: command.sealed,
                    policy,
                    accessClient: 'unknown',
                    acceptedCounters: [],
                    expectedError: 'unknown_access_client',
                },
                {
                    name: 'from a tombstoned Access Client',
                    sealed: command.sealed,
                    policy,
                    accessClient: 'tombstoned',
                    acceptedCounters: [],
                    expectedError: 'tombstoned_access_client',
                },
                {
                    name: 'with a tampered header',
                    sealed: tamperedHeader,
                    policy,
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'bad_signature',
                },
                {
                    name: 'with a tampered ciphertext',
                    sealed: {
                        ...command.sealed,
                        ciphertext: tamper(command.sealed.ciphertext),
                    },
                    policy,
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'bad_signature',
                },
                {
                    name: 'with a replayed counter',
                    sealed: command.sealed,
                    policy,
                    accessClient: 'active',
                    acceptedCounters: [1],
                    expectedError: 'replayed',
                },
                {
                    name: 'with a counter older than the window',
                    sealed: command.sealed,
                    policy,
                    accessClient: 'active',
                    acceptedCounters: [65],
                    expectedError: 'outside_window',
                },
                {
                    name: 'signed correctly but sealed to another Controller key',
                    sealed: toImpostor.sealed,
                    policy,
                    accessClient: 'active',
                    acceptedCounters: [],
                    expectedError: 'decrypt_failed',
                },
            ],
            /** Opened by the Access Client against `request`. */
            responses: [
                {
                    name: 'signed by a key other than the pinned one',
                    request: command.name,
                    sealed: forgedResponse,
                    expectedError: 'bad_signature',
                },
                {
                    name: 'answering a different request',
                    request: command.name,
                    sealed: {
                        ...response,
                        header: { ...response.header, requestId: 'req_9999' },
                    },
                    expectedError: 'mismatched_header',
                },
                {
                    name: 'with a tampered ciphertext',
                    request: command.name,
                    sealed: {
                        ...response,
                        ciphertext: tamper(response.ciphertext),
                    },
                    expectedError: 'bad_signature',
                },
            ],
            /** Opened against `request` with `acceptedCounters` already seen. */
            pushes: [
                {
                    name: 'replayed',
                    request: watch.name,
                    sealed: push1,
                    acceptedCounters: [1],
                    expectedError: 'replayed',
                },
                {
                    name: 'on another watch',
                    request: command.name,
                    sealed: push2,
                    acceptedCounters: [],
                    expectedError: 'mismatched_header',
                },
                {
                    name: 'signed by a key other than the pinned one',
                    request: watch.name,
                    sealed: forgedPush,
                    acceptedCounters: [],
                    expectedError: 'bad_signature',
                },
                {
                    name: 'with a tampered ciphertext',
                    request: watch.name,
                    sealed: { ...push1, ciphertext: tamper(push1.ciphertext) },
                    acceptedCounters: [],
                    expectedError: 'bad_signature',
                },
                {
                    name: 'with its counter rewritten',
                    request: watch.name,
                    sealed: {
                        ...push1,
                        header: { ...push1.header, counter: 3 },
                    },
                    acceptedCounters: [],
                    expectedError: 'bad_signature',
                },
            ],
            /** Verified against `controllerId` and the Controller's key. */
            grants: [
                {
                    name: 'signed by a key other than the Controller',
                    jws: forgedGrant,
                    expectedError: 'bad_signature',
                },
                {
                    name: 'issued by another Controller',
                    jws: otherControllerGrant,
                    expectedError: 'wrong_controller',
                },
                {
                    name: 'with alg none',
                    jws: `${noneHeader}.${grantPayload}.`,
                    expectedError: 'unsupported_algorithm',
                },
                {
                    name: 'with a tampered payload',
                    jws: `${grantHeader}.${b64urlEncode(utf8Encode('{"controllerId":"nemu_0123456789abcdef","accessClientId":"ac_evil","membershipId":"mem_42","signingKey":"","encryptionKey":"","iat":0}'))}.${grantSignature}`,
                    expectedError: 'bad_signature',
                },
                {
                    name: 'with two segments',
                    jws: `${grantHeader}.${grantPayload}`,
                    expectedError: 'malformed',
                },
            ],
        },
        /** Each step applies one counter to the window built so far. */
        replayWindow: [
            {
                name: 'accepts out-of-order counters once',
                steps: [
                    [1, 'accepted'],
                    [3, 'accepted'],
                    [2, 'accepted'],
                    [3, 'replayed'],
                ],
            },
            {
                name: 'keeps exactly 64 counters',
                steps: [
                    [100, 'accepted'],
                    [37, 'accepted'],
                    [36, 'outside_window'],
                    [37, 'replayed'],
                ],
            },
            {
                name: 'a jump past the window forgets older counters',
                steps: [
                    [5, 'accepted'],
                    [500, 'accepted'],
                    [5, 'outside_window'],
                    [437, 'accepted'],
                    [436, 'outside_window'],
                ],
            },
            {
                name: 'rejects counter zero',
                steps: [[0, 'outside_window']],
            },
        ],
    }
}
