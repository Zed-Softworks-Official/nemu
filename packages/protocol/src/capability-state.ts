import type { CapabilityCurrentState, CapabilityKind } from './capability.ts'
import type { DeviceEvent } from './events.ts'

export function canonicalQuantity(value: {
    value: number
    scale: number
}): number {
    return value.value / 10 ** value.scale
}

export type ScopedMeasurement = {
    kind: CapabilityKind
    quantity: number
    componentId?: string
}

export function measurementsForDevice(
    device: { protocol?: string; externalId?: string },
    capabilities: readonly CapabilityCurrentState[]
): ScopedMeasurement[] {
    if (device.protocol === undefined || device.externalId === undefined) {
        return []
    }
    const measurements: ScopedMeasurement[] = []
    for (const capability of capabilities) {
        if (
            capability.device.protocol !== device.protocol ||
            capability.device.externalId !== device.externalId ||
            capability.value === undefined
        ) {
            continue
        }
        measurements.push({
            kind: capability.kind,
            quantity: canonicalQuantity(capability.value),
            componentId:
                capability.physicalScope.kind === 'component'
                    ? capability.physicalScope.componentId
                    : undefined,
        })
    }
    return measurements
}

export type CapabilityView = {
    epoch: string
    revision: number
    capabilities: readonly CapabilityCurrentState[]
}

export class CapabilitySession {
    private current: CapabilityView | null = null
    private snapshotRequestOpen = false
    private expectedEpoch: string | null = null
    private rejectedSnapshotKey: string | null = null
    private readonly listeners = new Set<
        (view: CapabilityView | null) => void
    >()

    view(): CapabilityView | null {
        return this.current
    }

    subscribe(listener: (view: CapabilityView | null) => void): () => void {
        this.listeners.add(listener)
        listener(this.current)
        return () => {
            this.listeners.delete(listener)
        }
    }

    connect(requestSnapshot: () => void | Promise<void>): void {
        this.disconnect()
        this.snapshotRequestOpen = true
        this.invoke(requestSnapshot)
    }

    disconnect(): void {
        this.current = null
        this.snapshotRequestOpen = false
        this.expectedEpoch = null
        this.rejectedSnapshotKey = null
        this.publish()
    }

    deliver(
        event: DeviceEvent,
        requestSnapshot: () => void | Promise<void>
    ): void {
        if (event.type === 'capabilitySnapshot') {
            if (this.applySnapshot(event) === 'unsatisfied') {
                this.invoke(requestSnapshot)
            }
            return
        }
        if (event.type !== 'capabilityChange') return
        if (this.applyChange(event)) this.invoke(requestSnapshot)
    }

    private applySnapshot(
        snapshot: Extract<DeviceEvent, { type: 'capabilitySnapshot' }>
    ): 'installed' | 'unsatisfied' {
        if (
            this.expectedEpoch !== null &&
            snapshot.epoch !== this.expectedEpoch
        ) {
            const key = `${snapshot.epoch}:${snapshot.revision}`
            if (!this.snapshotRequestOpen || this.rejectedSnapshotKey === key) {
                return 'installed'
            }
            this.rejectedSnapshotKey = key
            return 'unsatisfied'
        }
        this.current = {
            epoch: snapshot.epoch,
            revision: snapshot.revision,
            capabilities: snapshot.capabilities.map((state) =>
                cloneState(state)
            ),
        }
        this.expectedEpoch = null
        this.snapshotRequestOpen = false
        this.rejectedSnapshotKey = null
        this.publish()
        return 'installed'
    }

    private applyChange(
        change: Extract<DeviceEvent, { type: 'capabilityChange' }>
    ): boolean {
        if (this.current === null || change.epoch !== this.current.epoch) {
            const hadState = this.current !== null
            this.current = null
            this.expectedEpoch = change.epoch
            this.rejectedSnapshotKey = null
            if (hadState) this.publish()
            return this.openSnapshotRequest()
        }
        if (change.revision <= this.current.revision) return false
        if (change.revision !== this.current.revision + 1) {
            return this.openSnapshotRequest()
        }

        const capabilities = this.current.capabilities.map((state) =>
            state.capabilityId === change.state.capabilityId
                ? cloneState(change.state)
                : state
        )
        if (
            !capabilities.some(
                (state) => state.capabilityId === change.state.capabilityId
            )
        ) {
            capabilities.push(cloneState(change.state))
        }
        this.current = {
            epoch: change.epoch,
            revision: change.revision,
            capabilities,
        }
        this.publish()
        return false
    }

    private publish(): void {
        for (const listener of this.listeners) {
            listener(this.current)
        }
    }

    private openSnapshotRequest(): boolean {
        if (this.snapshotRequestOpen) return false
        this.snapshotRequestOpen = true
        return true
    }

    private invoke(requestSnapshot: () => void | Promise<void>): void {
        try {
            const result = requestSnapshot()
            if (result instanceof Promise) {
                void result.catch(() => {
                    this.snapshotRequestOpen = false
                })
            }
        } catch {
            this.snapshotRequestOpen = false
        }
    }
}

export function deviceEventRefreshesInventory(event: DeviceEvent): boolean {
    return (
        event.type === 'resync' ||
        event.type === 'deviceJoined' ||
        event.type === 'deviceLeft' ||
        event.type === 'deviceState'
    )
}

function cloneState(state: CapabilityCurrentState): CapabilityCurrentState {
    return {
        ...state,
        value: state.value === undefined ? undefined : { ...state.value },
        availability: { ...state.availability },
    }
}
