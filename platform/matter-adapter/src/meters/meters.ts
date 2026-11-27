/**
 * Meters: decides what a Device's `{id}/capabilities` and `{id}/observations`
 * should hold, from its attribute snapshot plus the persisted meter identity
 * and assigned Capability IDs. Ported from the Rust adapter's `publish_meter`.
 *
 * - A fresh reading (an electrical attribute report) gets a new observation
 *   ID and time from the adapter clock.
 * - Anything else (inventory republish, an OnOff change, newly assigned
 *   Capability IDs) reuses the stored envelope, so an unchanged reading is
 *   never a new observation and nothing is republished. Assigned Capability
 *   IDs therefore appear with the next fresh reading, as in Rust.
 * - A Device that stops reporting any reading has both topics cleared.
 */
import type {
    BridgeCapabilityManifest,
    BridgeObservationReport,
} from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import type { Log } from '../log.ts'
import type { EndpointDevice } from '../mapping/index.ts'
import { CapabilityIdStore } from '../stores/capability-id-store.ts'
import {
    MeterIdentityStore,
    type PublishedMeter,
} from '../stores/meter-identity-store.ts'
import {
    assignedCapabilityIds,
    freshObservedUnix,
    meterPublication,
    observationStamp,
} from './publication.ts'

export type MeterUpdate =
    /** Publish both retained topics. */
    | {
          kind: 'publish'
          manifest: BridgeCapabilityManifest
          report: BridgeObservationReport
      }
    /** The clock is unavailable: publish the manifest only. */
    | { kind: 'manifest'; manifest: BridgeCapabilityManifest }
    /** The Device has no readings any more: clear both retained topics. */
    | { kind: 'clear' }
    /** Nothing changed. */
    | { kind: 'none' }

/** Milliseconds since the Unix epoch, or undefined when the clock is unknown. */
export type Clock = () => number | undefined

const PROBE = { observedAt: '1970-01-01T00:00:00Z', observationId: 'probe' }

export class Meters {
    constructor(
        private readonly identities = MeterIdentityStore.inMemory(),
        private readonly capabilityIds = CapabilityIdStore.inMemory(),
        private readonly clock: Clock = Date.now
    ) {}

    /** Meters backed by the stores in the data dir. */
    static load(dataDir: string, log?: Log): Meters {
        return new Meters(
            MeterIdentityStore.load(dataDir, log),
            CapabilityIdStore.load(dataDir, log)
        )
    }

    /**
     * What to publish for a Device now. `fresh` is true when an electrical
     * attribute was just reported.
     */
    update(
        device: EndpointDevice,
        snapshot: AttributeSnapshot,
        fresh: boolean
    ): MeterUpdate {
        const capabilityIds = this.capabilityIds.get(device.id)
        const previous = this.identities.get(device.id)
        const probe = meterPublication(device, snapshot, PROBE, capabilityIds)
        if (!probe) {
            if (!previous) return { kind: 'none' }
            this.identities.remove(device.id)
            return { kind: 'clear' }
        }
        const reuses = previous?.fingerprint === probe.fingerprint && !fresh
        let stamp: ReturnType<typeof observationStamp>
        if (reuses) {
            stamp = observationStamp({
                deviceId: device.id,
                sequence: 0,
                ...(previous ? { previous } : {}),
                fingerprint: probe.fingerprint,
                fresh: false,
            })
        } else {
            const millis = this.clock()
            if (millis === undefined)
                return { kind: 'manifest', manifest: probe.manifest }
            stamp = observationStamp({
                deviceId: device.id,
                sequence: this.identities.nextSequence(),
                now: {
                    seconds: freshObservedUnix(
                        device,
                        snapshot,
                        Math.floor(millis / 1000)
                    ),
                    millis,
                },
                fingerprint: probe.fingerprint,
                fresh: true,
            })
        }
        if (!stamp) return { kind: 'none' }
        const publication = meterPublication(
            device,
            snapshot,
            stamp,
            capabilityIds
        )
        if (!publication) return { kind: 'none' }
        const published: PublishedMeter = {
            fingerprint: publication.fingerprint,
            observedAt: stamp.observedAt,
            observationId: stamp.observationId,
        }
        if (previous && samePublished(previous, published))
            return { kind: 'none' }
        this.identities.insert(device.id, published)
        return {
            kind: 'publish',
            manifest: publication.manifest,
            report: publication.report,
        }
    }

    /**
     * Stores the Capability IDs Core assigned over `{id}/capability-ids`.
     * True when they changed.
     */
    assign(deviceId: string, payload: unknown): boolean {
        const assigned = assignedCapabilityIds(payload)
        if (Object.keys(assigned).length === 0) return false
        return this.capabilityIds.set(deviceId, assigned)
    }

    /** Forgets a removed Device's meter identity and Capability IDs. */
    forget(deviceId: string): void {
        this.identities.remove(deviceId)
        this.capabilityIds.remove(deviceId)
    }
}

function samePublished(a: PublishedMeter, b: PublishedMeter): boolean {
    return (
        a.fingerprint === b.fingerprint &&
        a.observedAt === b.observedAt &&
        a.observationId === b.observationId
    )
}
