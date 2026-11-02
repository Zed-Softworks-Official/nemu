export type { CapabilityView } from '@nemu/protocol'
export type { ControllerConnectionOptions } from './connection.ts'
export { ControllerConnection } from './connection.ts'
export type { ProbeResult } from './discovery.ts'
export {
    buildTlsTrustUrl,
    DEFAULT_HTTPS_LAN_CANDIDATES,
    DEFAULT_LAN_CANDIDATES,
    discoverController,
    identifyController,
    isLanControllerOrigin,
    isLocalDevDashboard,
    isLoopbackControllerUrl,
    isSelfSignedLanUrl,
    lanDiscoveryCandidates,
    lanUrlsFromHostnames,
    probeController,
    TLS_TRUST_URL,
    TLS_TRUSTED_MESSAGE,
    upgradeToHttps,
} from './discovery.ts'
export { createControllerHttp, toApiError } from './http.ts'
export type {
    PairWithControllerInput,
    PairWithControllerResult,
} from './pairing.ts'
export { mintSessionViaRelay, pairWithController } from './pairing.ts'
export type {
    CommissionProgress,
    ControllerProviderProps,
    DevicePairingPhase,
    MatterPairingStep,
    PairingInterview,
    PairingKind,
} from './provider.tsx'
export {
    ControllerProvider,
    useCapabilityState,
    useController,
    useDevicePairing,
    useDevices,
} from './provider.tsx'
export {
    clearClientToken,
    clearRememberedBaseUrl,
    clearRememberedControllerId,
    getClientToken,
    getRememberedBaseUrl,
    getRememberedControllerId,
    setClientToken,
    setRememberedBaseUrl,
    setRememberedControllerId,
} from './storage.ts'
export { LanTransport } from './transports/lan.ts'
export type { RelayApi, RelayTransportOptions } from './transports/relay.ts'
export { RelayTransport } from './transports/relay.ts'
export type { ControllerTransport } from './transports/types.ts'
