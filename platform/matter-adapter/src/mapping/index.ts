/**
 * Mapping: a pure translation from a Matter attribute snapshot to Nemu's
 * canonical Device descriptor, Device state and Commands. No I/O; the Seam 2
 * test target (NEM-109).
 */
export {
    commandsForSet,
    type DeviceCommand,
    outletFromSet,
    type SetCommands,
    targetEndpoints,
} from './commands.ts'
export { deviceDescriptor, isLimitAttribute } from './descriptor.ts'
export {
    collapsedLegacyIds,
    type DeviceKind,
    deviceCoversEndpoint,
    type EndpointDevice,
    mapNode,
    mapNodeWithFallback,
    type StripOutlet,
} from './node.ts'
export {
    isPlaceholder,
    mapNodeOrPlaceholder,
    placeholderDevice,
} from './placeholder.ts'
export { stateForDevice } from './state.ts'
