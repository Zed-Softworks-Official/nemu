/**
 * Mapping: a pure translation from a Matter attribute snapshot to Nemu's
 * canonical Device descriptor, Device state and Commands. No I/O; the Seam 2
 * test target (NEM-109).
 */
export {
    commandsForSet,
    type DeviceCommand,
    type SetCommands,
    targetEndpoints,
} from './commands.ts'
export { deviceDescriptor } from './descriptor.ts'
export { type DeviceKind, type EndpointDevice, mapNode } from './node.ts'
export { stateForDevice } from './state.ts'
