/**
 * Matter electrical clusters become a canonical Capability manifest and an
 * observation envelope. Pure; ported from the Rust adapter's `meters.rs`.
 *
 * Values keep the clusters' own encoding: one milli-unit (mW, mV, mA, mWh), so
 * every reading is an integer at scale 3. Readings are absolute; cumulative
 * energy is never turned into a delta here. Core starts a new Meter epoch when
 * a cumulative counter falls by more than its resolution
 * (`platform/core/src/capabilities/meter_epoch.rs`), so a reset counter is
 * published as its new absolute value, never as a negative or huge jump.
 */
import type {
    BridgeCapabilityIdentity,
    BridgeCapabilityManifest,
    BridgeObservationReport,
} from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import {
    CLUSTER_ELECTRICAL_ENERGY,
    CLUSTER_ELECTRICAL_POWER,
} from '../mapping/clusters.ts'
import type { EndpointDevice } from '../mapping/index.ts'
import { attr, structField } from '../mapping/snapshot.ts'
import type { AssignedIds } from '../stores/capability-id-store.ts'

export const PROFILE_REVISION = 'matter-electrical-v1'
export const PROFILE_EFFECTIVE_AT = '2026-01-01T00:00:00Z'
export const PROFILE_FRESHNESS_MS = 90_000
const MILLI_SCALE = 3
/**
 * The cluster encoding is known, but History admission waits until a physical
 * load has proved the profile, so an unverified meter stays current-state only:
 * the manifest supports no envelope version and the report carries none.
 */
export const PROFILE_VERIFIED = false

/** ElectricalPowerMeasurement attributes. */
const ATTR_VOLTAGE = 4
const ATTR_ACTIVE_CURRENT = 5
const ATTR_ACTIVE_POWER = 8
const ATTR_RMS_VOLTAGE = 11
const ATTR_RMS_CURRENT = 12
const ATTR_RMS_POWER = 13
/** ElectricalEnergyMeasurement attributes. */
const ATTR_CUMULATIVE_IMPORTED = 1
const ATTR_CUMULATIVE_EXPORTED = 2

export interface ObservationStamp {
    observedAt: string
    observationId: string
}

export interface MeterPublication {
    manifest: BridgeCapabilityManifest
    report: BridgeObservationReport
    /** The readings, for telling a changed reading from a repeated one. */
    fingerprint: string
}

type Kind = BridgeCapabilityIdentity['kind']
type ScopeKind = 'device' | 'component'

interface Reading {
    key: string
    kind: Kind
    unit: 'W' | 'V' | 'A' | 'Wh'
    directionality: 'nonnegative' | 'bidirectional'
    scopeKind: ScopeKind
    componentId?: string
    value: number
}

/** How a reading is matched to the Capability ID Core assigned it. */
export function identityKey(
    kind: string,
    scopeKind: string,
    componentId?: string
): string {
    return `${kind}|${scopeKind}|${componentId ?? ''}`
}

/**
 * ActivePower is the primary reading. An exact zero is not trusted when
 * RMSPower shows a load: that is how a live plug once showed 0 W. A lone zero
 * with no RMSPower to corroborate it is no reading at all.
 */
export function verifiedPowerMilliwatts(
    snapshot: AttributeSnapshot,
    endpoint: number
): number | undefined {
    const active = decodeInteger(
        attr(snapshot, endpoint, CLUSTER_ELECTRICAL_POWER, ATTR_ACTIVE_POWER)
    )
    const rms = decodeInteger(
        attr(snapshot, endpoint, CLUSTER_ELECTRICAL_POWER, ATTR_RMS_POWER)
    )
    if (active === 0) return rms
    return active ?? rms
}

/**
 * The publication for a Device's current readings, or undefined when it has
 * none. `reset` marks every reading; it is left off unless the caller knows.
 */
export function meterPublication(
    device: EndpointDevice,
    snapshot: AttributeSnapshot,
    stamp: ObservationStamp,
    capabilityIds: AssignedIds,
    reset?: boolean
): MeterPublication | undefined {
    const readings = readingsFor(device, snapshot)
    if (readings.length === 0) return undefined
    const report: BridgeObservationReport = {
        observationId: stamp.observationId,
        observedAt: stamp.observedAt,
        timeTrust: 'trustworthy',
        observations: readings.map((reading) => {
            const capabilityId = capabilityIds[reading.key]
            return {
                identity: identityOf(device, reading),
                ...(capabilityId === undefined ? {} : { capabilityId }),
                ...(reset === undefined ? {} : { reset }),
                reading: {
                    status: 'value' as const,
                    value: {
                        value: reading.value,
                        scale: MILLI_SCALE,
                        constraintRevisionId: PROFILE_REVISION,
                    },
                },
            }
        }),
    }
    if (PROFILE_VERIFIED) report.schemaVersion = 1
    return {
        manifest: {
            schemaVersion: 1,
            supportedObservationEnvelopeVersions: PROFILE_VERIFIED ? [1] : [],
            device: { protocol: 'matter', externalId: device.id },
            capabilities: readings.map((reading) => ({
                identity: identityOf(device, reading),
                unit: reading.unit,
                directionality: reading.directionality,
                constraintRevisions: [
                    {
                        revisionId: PROFILE_REVISION,
                        declaredAt: PROFILE_EFFECTIVE_AT,
                        effectiveAt: PROFILE_EFFECTIVE_AT,
                        scale: MILLI_SCALE,
                        bounds: {
                            minimum:
                                reading.directionality === 'bidirectional'
                                    ? -Number.MAX_SAFE_INTEGER
                                    : 0,
                            maximum: Number.MAX_SAFE_INTEGER,
                        },
                        resolution: 1,
                        freshnessMs: PROFILE_FRESHNESS_MS,
                        historyAdmission: {
                            maximumObservations: 60,
                            intervalMs: 60_000,
                        },
                    },
                ],
            })),
        },
        report,
        fingerprint: readings
            .map((reading) => `${reading.key}=${reading.value}`)
            .join(';'),
    }
}

/**
 * Reuses the retained envelope when the reading has not freshly changed.
 * Otherwise stamps a new one from the clock, and a missing clock gives no
 * stamp: it never becomes the Unix epoch with trustworthy time.
 */
export function observationStamp(options: {
    deviceId: string
    sequence: number
    /** Observation time in Unix seconds and the adapter clock in ms. */
    now?: { seconds: number; millis: number }
    previous?: { fingerprint: string } & ObservationStamp
    fingerprint: string
    fresh: boolean
}): ObservationStamp | undefined {
    const { previous } = options
    if (
        previous &&
        previous.fingerprint === options.fingerprint &&
        !options.fresh
    )
        return {
            observedAt: previous.observedAt,
            observationId: previous.observationId,
        }
    if (!options.now) return undefined
    return {
        observedAt: rfc3339Utc(options.now.seconds),
        observationId: `${options.deviceId}:${options.now.millis}:${options.sequence}`,
    }
}

/**
 * A Device timestamp becomes `observedAt` only once the meter profile is
 * verified. Until then the adapter clock is the observation time.
 */
export function selectObservedSeconds(
    deviceUnix: number | undefined,
    adapterUnix: number,
    profileVerified: boolean
): number {
    return profileVerified ? (deviceUnix ?? adapterUnix) : adapterUnix
}

export function freshObservedUnix(
    device: EndpointDevice,
    snapshot: AttributeSnapshot,
    adapterUnix: number
): number {
    return selectObservedSeconds(
        deviceEnergyTimestamp(device, snapshot),
        adapterUnix,
        PROFILE_VERIFIED
    )
}

/** The cumulative imported energy's end (else start) timestamp, if any. */
export function deviceEnergyTimestamp(
    device: EndpointDevice,
    snapshot: AttributeSnapshot
): number | undefined {
    for (const { endpoint } of endpointSubjects(device)) {
        const measurement = attr(
            snapshot,
            endpoint,
            CLUSTER_ELECTRICAL_ENERGY,
            ATTR_CUMULATIVE_IMPORTED
        )
        if (!isObject(measurement)) continue
        const raw = ['2', 'endTimestamp', '1', 'startTimestamp'].find(
            (field) => measurement[field] !== undefined
        )
        if (raw === undefined) continue
        const value = measurement[raw]
        return Number.isSafeInteger(value) && (value as number) >= 0
            ? (value as number)
            : undefined
    }
    return undefined
}

/** Unix seconds as `YYYY-MM-DDTHH:MM:SSZ`. */
export function rfc3339Utc(seconds: number): string {
    return `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`
}

/** Capability IDs Core assigned, keyed by identity, from a capability-ids payload. */
export function assignedCapabilityIds(payload: unknown): AssignedIds {
    const assigned: Record<string, string> = {}
    if (!isObject(payload) || !Array.isArray(payload.capabilities))
        return assigned
    for (const capability of payload.capabilities) {
        if (!isObject(capability) || !isObject(capability.identity)) continue
        if (typeof capability.capabilityId !== 'string') continue
        const identity = capability.identity
        const scope = isObject(identity.physicalScope)
            ? identity.physicalScope
            : {}
        assigned[
            identityKey(
                typeof identity.kind === 'string' ? identity.kind : '',
                typeof scope.kind === 'string' ? scope.kind : '',
                typeof scope.componentId === 'string'
                    ? scope.componentId
                    : undefined
            )
        ] = capability.capabilityId
    }
    return assigned
}

/** Whether a change to this attribute is a fresh meter reading. */
export function isMeterAttribute(key: string): boolean {
    const cluster = Number(key.split('/')[1])
    return (
        cluster === CLUSTER_ELECTRICAL_POWER ||
        cluster === CLUSTER_ELECTRICAL_ENERGY
    )
}

interface Subject {
    endpoint: number
    scopeKind: ScopeKind
    componentId?: string
}

function endpointSubjects(device: EndpointDevice): Subject[] {
    // A strip measures each outlet as its Component, and a separate energy
    // endpoint as the Device.
    const { outlets, energyEndpoint } = device
    if (outlets) {
        const subjects: Subject[] = outlets.map((outlet) => ({
            endpoint: outlet.endpoint,
            scopeKind: 'component',
            componentId: String(outlet.endpoint),
        }))
        if (
            energyEndpoint !== undefined &&
            outlets.every((outlet) => outlet.endpoint !== energyEndpoint)
        )
            subjects.push({ endpoint: energyEndpoint, scopeKind: 'device' })
        return subjects
    }
    if (device.energyEndpoint === undefined)
        return [{ endpoint: device.endpoint, scopeKind: 'device' }]
    const subjects: Subject[] = [
        { endpoint: device.energyEndpoint, scopeKind: 'device' },
    ]
    if (device.energyEndpoint !== device.endpoint)
        subjects.push({ endpoint: device.endpoint, scopeKind: 'device' })
    return subjects
}

function readingsFor(
    device: EndpointDevice,
    snapshot: AttributeSnapshot
): Reading[] {
    const readings: Reading[] = []
    const seen = new Set<string>()
    for (const subject of endpointSubjects(device)) {
        for (const reading of endpointReadings(subject, snapshot)) {
            if (seen.has(reading.key)) continue
            seen.add(reading.key)
            readings.push(reading)
        }
    }
    return readings
}

function endpointReadings(
    { endpoint, scopeKind, componentId }: Subject,
    snapshot: AttributeSnapshot
): Reading[] {
    const readings: Reading[] = []
    const add = (
        kind: Kind,
        unit: Reading['unit'],
        value: number | undefined,
        directionality: Reading['directionality'] = 'nonnegative'
    ) => {
        if (value === undefined) return
        readings.push({
            key: identityKey(kind, scopeKind, componentId),
            kind,
            unit,
            directionality,
            scopeKind,
            ...(componentId === undefined ? {} : { componentId }),
            value,
        })
    }
    const power = (attribute: number) =>
        integer(attr(snapshot, endpoint, CLUSTER_ELECTRICAL_POWER, attribute))
    add(
        'power',
        'W',
        verifiedPowerMilliwatts(snapshot, endpoint),
        'bidirectional'
    )
    add('voltage', 'V', power(ATTR_VOLTAGE) ?? power(ATTR_RMS_VOLTAGE))
    add('current', 'A', power(ATTR_ACTIVE_CURRENT) ?? power(ATTR_RMS_CURRENT))
    add(
        'importedEnergy',
        'Wh',
        energyMilliwattHours(snapshot, endpoint, ATTR_CUMULATIVE_IMPORTED)
    )
    add(
        'exportedEnergy',
        'Wh',
        energyMilliwattHours(snapshot, endpoint, ATTR_CUMULATIVE_EXPORTED)
    )
    return readings
}

function energyMilliwattHours(
    snapshot: AttributeSnapshot,
    endpoint: number,
    attribute: number
): number | undefined {
    const measurement = attr(
        snapshot,
        endpoint,
        CLUSTER_ELECTRICAL_ENERGY,
        attribute
    )
    const value = integer(structField(measurement, 0, ['energy']))
    return value !== undefined && value >= 0 ? value : undefined
}

function identityOf(
    device: EndpointDevice,
    reading: Reading
): BridgeCapabilityIdentity {
    return {
        device: { protocol: 'matter', externalId: device.id },
        componentPath:
            reading.componentId === undefined ? [] : [reading.componentId],
        kind: reading.kind,
        physicalScope:
            reading.componentId === undefined
                ? { kind: 'device' }
                : { kind: 'component', componentId: reading.componentId },
    }
}

/**
 * A safe integer. A larger one arrives from the session as a decimal string
 * and is no reading, so a counter past 2^53 never publishes a huge value.
 */
function integer(value: unknown): number | undefined {
    return Number.isSafeInteger(value) ? (value as number) : undefined
}

/** An integer, or one wrapped as `{ value }` or `{ "0": … }`. */
function decodeInteger(value: unknown): number | undefined {
    if (isObject(value)) {
        for (const key of ['value', '0']) {
            const decoded = decodeInteger(value[key])
            if (decoded !== undefined) return decoded
        }
        return undefined
    }
    return integer(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
