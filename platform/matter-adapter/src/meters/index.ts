/**
 * Meters: Matter electrical power and energy measurement attributes, plus the
 * persisted meter identity, become canonical Capability observations. The
 * publication is pure (Seam 2); `Meters` adds observation identity and
 * assigned Capability IDs from the stores.
 */
export { type Clock, Meters, type MeterUpdate } from './meters.ts'
export {
    assignedCapabilityIds,
    deviceEnergyTimestamp,
    identityKey,
    isMeterAttribute,
    type MeterPublication,
    meterPublication,
    type ObservationStamp,
    observationStamp,
    rfc3339Utc,
    selectObservedSeconds,
    verifiedPowerMilliwatts,
} from './publication.ts'
