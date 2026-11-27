// `@nemu/protocol/relay-crypto`: end-to-end Relay crypto (ADR-0001) and
// CPace pairing (ADR-0037). Pure JS on @noble, so it runs on Hermes with no
// WASM and no Node crypto; randomness comes from `crypto.getRandomValues`,
// which React Native gets from expo-crypto.
//
// Core's `relay_crypto` module is the Rust twin. Both are checked against
// `testdata/relay-crypto/vectors.json`.

export {
    b64urlDecode,
    b64urlEncode,
    equalBytes,
    hexDecode,
    hexEncode,
    utf8Decode,
    utf8Encode,
} from './bytes.ts'
export {
    accessClientAssociatedData,
    CpaceError,
    type CpaceErrorCode,
    CpaceInitiator,
    CpaceResponder,
    controllerAssociatedData,
    type InitiatorMessage,
    type InitiatorOutcome,
    PAIRING_LABEL,
    type PairingContext,
    type PartyKeys,
    type ResponderMessage,
    type ResponderOutcome,
} from './cpace.ts'
export {
    type AccessClientStatus,
    CLOCK_SKEW_MS,
    encodePushHeader,
    encodeRequestHeader,
    encodeResponseHeader,
    type OpenedRequest,
    openPush,
    openRequest,
    openResponse,
    type PushHeader,
    pushHeaderFor,
    pushHeaderSchema,
    RelayCryptoError,
    type RelayRejection,
    type RequestHeader,
    type RequestKeys,
    type RequestPolicy,
    type ResponseHeader,
    replyKeys,
    requestHeaderSchema,
    responseHeaderFor,
    responseHeaderSchema,
    type SealedPush,
    type SealedRequest,
    type SealedResponse,
    sealedPushSchema,
    sealedRequestSchema,
    sealedResponseSchema,
    sealPush,
    sealRequest,
    sealResponse,
} from './envelope.ts'
export {
    type AccessGrant,
    GRANT_TYPE,
    GrantError,
    type GrantRejection,
    issueGrant,
    verifyGrant,
} from './grant.ts'
export { acceptableEncryptionKey, x25519PublicKey } from './hpke.ts'
export {
    encodeMembershipProjection,
    type MembershipProjection,
    type MembershipRoutingState,
    membershipProjectionSchema,
    membershipRoutingStateSchema,
    ProjectionError,
    type ProjectionRejection,
    type SignedMembershipProjection,
    signedMembershipProjectionSchema,
    signMembershipProjection,
    supersedesProjection,
    verifyMembershipProjection,
} from './projection.ts'
export {
    acceptCounter,
    EMPTY_REPLAY_WINDOW,
    REPLAY_WINDOW_SIZE,
    type ReplayRejection,
    type ReplayResult,
    type ReplayWindow,
} from './replay.ts'
export {
    LAN_REFUSAL_LABEL,
    type LanRefusal,
    LOCAL_SESSION_LABEL,
    LOCAL_SESSION_NONCE_LENGTH,
    type LocalSessionChallenge,
    lanRefusalMessage,
    localSessionMessage,
    signLanRefusal,
    signLocalSessionChallenge,
    verifyLanRefusal,
    verifyLocalSessionChallenge,
} from './session.ts'
export {
    acceptableSigningKey,
    type Ed25519Signer,
    ed25519PublicKey,
    ed25519Signer,
    ed25519Verify,
} from './signing.ts'
