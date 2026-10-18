import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CapabilityCurrentState } from './capability.ts'
import {
    CapabilitySession,
    deviceEventRefreshesInventory,
    measurementsForDevice,
} from './capability-state.ts'
import { type DeviceEvent, deviceEventSchema } from './events.ts'

const powerId = '6f1d7c6a-6a2e-4d0a-9c3e-3d6c1b9a4e21'
const voltageId = '91c2a4de-1b70-4f55-8a6d-0e5c7b8a1234'
const epochA = '2b7e1c4a-8f3d-4a6b-9c1e-5d8a7b6c4e32'
const epochB = 'c4e8a1b2-6d30-4f77-9a12-7b6e5d4c3b21'

function reading(
    capabilityId: string,
    revision: number,
    value: number
): CapabilityCurrentState {
    return {
        capabilityId: capabilityId as CapabilityCurrentState['capabilityId'],
        device: { protocol: 'matter', externalId: 'plug-1' },
        physicalScope: { kind: 'device' },
        kind: 'power',
        value: {
            value,
            scale: 3,
            constraintRevisionId: 'limits-2026-09-11' as NonNullable<
                CapabilityCurrentState['value']
            >['constraintRevisionId'],
        },
        availability: { status: 'available' },
        observedAt: '2026-10-09T18:00:00.000Z',
        receivedAt: '2026-10-09T18:00:01.000Z',
        revision,
    }
}

function snapshot(
    epoch: string,
    revision: number,
    capabilities: CapabilityCurrentState[]
): DeviceEvent {
    return deviceEventSchema.parse({
        type: 'capabilitySnapshot',
        epoch,
        revision,
        capabilities,
    })
}

function change(
    epoch: string,
    revision: number,
    state: CapabilityCurrentState
): DeviceEvent {
    return deviceEventSchema.parse({
        type: 'capabilityChange',
        epoch,
        revision,
        state,
    })
}

describe('capability current-state session', () => {
    it('applies consecutive revisions to one Capability', () => {
        const session = new CapabilitySession()
        const requests: string[] = []
        const voltage = {
            ...reading(voltageId, 2, 120_000),
            kind: 'voltage' as const,
        }
        session.deliver(
            snapshot(epochA, 2, [reading(powerId, 2, 1500), voltage]),
            () => {
                requests.push('snapshot')
            }
        )

        const before = session.view()?.capabilities[1]
        session.deliver(change(epochA, 3, reading(powerId, 3, 1600)), () => {
            requests.push('snapshot')
        })

        const view = session.view()
        assert.equal(view?.revision, 3)
        assert.equal(view?.capabilities[0]?.value?.value, 1600)
        assert.equal(view?.capabilities[1], before)
        assert.deepEqual(requests, [])
        assert.equal(
            deviceEventRefreshesInventory(
                change(epochA, 3, reading(powerId, 3, 1600))
            ),
            false
        )
    })

    it('asks for one snapshot when a revision is skipped', () => {
        const session = new CapabilitySession()
        const requests: string[] = []
        const ask = () => {
            requests.push('snapshot')
        }
        session.deliver(snapshot(epochA, 2, [reading(powerId, 2, 1500)]), ask)
        session.deliver(change(epochA, 5, reading(powerId, 5, 1800)), ask)
        session.deliver(change(epochA, 6, reading(powerId, 6, 1900)), ask)

        assert.deepEqual(requests, ['snapshot'])
        assert.equal(session.view()?.revision, 2)
        assert.equal(session.view()?.capabilities[0]?.value?.value, 1500)
    })

    it('discards cached state and asks once when the State epoch changes', () => {
        const session = new CapabilitySession()
        const requests: string[] = []
        const ask = () => {
            requests.push('snapshot')
        }
        session.deliver(snapshot(epochA, 4, [reading(powerId, 4, 1500)]), ask)
        session.deliver(change(epochB, 1, reading(powerId, 1, 10)), ask)
        session.deliver(change(epochB, 2, reading(powerId, 2, 20)), ask)

        assert.equal(session.view(), null)
        assert.deepEqual(requests, ['snapshot'])

        session.deliver(snapshot(epochA, 4, [reading(powerId, 4, 1500)]), ask)
        assert.equal(session.view(), null)
        assert.deepEqual(requests, ['snapshot', 'snapshot'])

        session.deliver(snapshot(epochA, 4, [reading(powerId, 4, 1500)]), ask)
        assert.equal(session.view(), null)
        assert.deepEqual(requests, ['snapshot', 'snapshot'])

        session.deliver(snapshot(epochB, 2, [reading(powerId, 2, 20)]), ask)
        assert.equal(session.view()?.epoch, epochB)
        assert.equal(session.view()?.capabilities[0]?.value?.value, 20)
        assert.deepEqual(requests, ['snapshot', 'snapshot'])
    })

    it('ignores duplicate revisions', () => {
        const session = new CapabilitySession()
        session.deliver(
            snapshot(epochA, 4, [reading(powerId, 4, 1500)]),
            () => {
                throw new Error('snapshot was not requested')
            }
        )
        const before = session.view()
        session.deliver(change(epochA, 4, reading(powerId, 4, 9999)), () => {
            throw new Error('snapshot was not requested')
        })
        session.deliver(change(epochA, 3, reading(powerId, 3, 1)), () => {
            throw new Error('snapshot was not requested')
        })
        assert.equal(session.view(), before)
        assert.equal(session.view()?.capabilities[0]?.value?.value, 1500)
    })

    it('converges from a snapshot after disconnect and reconnect', () => {
        const session = new CapabilitySession()
        const requests: string[] = []
        session.deliver(
            snapshot(epochA, 2, [reading(powerId, 2, 1500)]),
            () => {
                requests.push('snapshot')
            }
        )
        session.deliver(change(epochA, 3, reading(powerId, 3, 1600)), () => {
            requests.push('snapshot')
        })

        session.disconnect()
        assert.equal(session.view(), null)

        session.connect(() => {
            requests.push('reconnect')
        })
        assert.deepEqual(requests, ['reconnect'])
        session.deliver(
            snapshot(epochA, 8, [reading(powerId, 8, 2400)]),
            () => {
                requests.push('snapshot')
            }
        )

        assert.equal(session.view()?.epoch, epochA)
        assert.equal(session.view()?.revision, 8)
        assert.equal(session.view()?.capabilities[0]?.value?.value, 2400)
        assert.deepEqual(requests, ['reconnect'])
    })

    it('does not treat a legacy state report as capability state', () => {
        const session = new CapabilitySession()
        session.deliver(
            {
                type: 'deviceState',
                deviceId: 'device-1',
                state: { power: 12.5, energy: 3 },
            },
            () => {
                throw new Error('legacy state report requested a snapshot')
            }
        )
        assert.equal(session.view(), null)
    })

    it('keeps device inventory refresh off the live observation path', () => {
        const live = change(epochA, 3, reading(powerId, 3, 1600))
        const full = snapshot(epochA, 3, [reading(powerId, 3, 1600)])
        assert.equal(deviceEventRefreshesInventory(live), false)
        assert.equal(deviceEventRefreshesInventory(full), false)
        assert.equal(
            deviceEventRefreshesInventory({
                type: 'deviceState',
                deviceId: 'device-1',
                state: {},
            }),
            true
        )

        const session = new CapabilitySession()
        let inventoryReads = 0
        let commandFinished = false
        const command = Promise.resolve().then(() => {
            commandFinished = true
        })
        session.deliver(
            snapshot(epochA, 1, [reading(powerId, 1, 1000)]),
            () => {
                inventoryReads += 1
            }
        )
        for (let revision = 2; revision <= 40; revision += 1) {
            session.deliver(
                change(epochA, revision, reading(powerId, revision, revision)),
                () => {
                    inventoryReads += 1
                }
            )
        }
        return command.then(() => {
            assert.equal(commandFinished, true)
            assert.equal(inventoryReads, 0)
            assert.equal(session.view()?.revision, 40)
        })
    })

    it('reads measurements from the typed snapshot for the matching device', () => {
        const measurements = measurementsForDevice(
            { protocol: 'matter', externalId: 'plug-1' },
            [
                reading(powerId, 4, 1500),
                {
                    ...reading(voltageId, 4, 120_000),
                    kind: 'voltage',
                    physicalScope: { kind: 'component', componentId: '2' },
                },
            ]
        )
        assert.deepEqual(measurements, [
            { kind: 'power', quantity: 1.5, componentId: undefined },
            { kind: 'voltage', quantity: 120, componentId: '2' },
        ])
        assert.deepEqual(
            measurementsForDevice(
                { protocol: 'zigbee', externalId: 'plug-1' },
                [reading(powerId, 4, 1500)]
            ),
            []
        )
    })
})
