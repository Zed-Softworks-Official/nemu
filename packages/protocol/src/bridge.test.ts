import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    bridgeAvailabilitySchema,
    bridgeCapabilityManifestSchema,
    bridgeDeviceSchema,
    bridgeDevicesSchema,
    bridgeEventSchema,
    bridgeObservationReportSchema,
    bridgeResponseSchema,
    bridgeStateSchema,
} from './bridge.ts'

/** A plug's power Capability as the Rust Matter adapter publishes it (golden). */
const powerIdentity = {
    componentPath: [],
    device: { externalId: '2', protocol: 'matter' },
    kind: 'power',
    physicalScope: { kind: 'device' },
}

describe('bridge Capability payloads', () => {
    it('accepts the golden manifest with no envelope versions', () => {
        const manifest = {
            schemaVersion: 1,
            supportedObservationEnvelopeVersions: [],
            device: { externalId: '2', protocol: 'matter' },
            capabilities: [
                {
                    identity: powerIdentity,
                    unit: 'W',
                    directionality: 'bidirectional',
                    constraintRevisions: [
                        {
                            revisionId: 'matter-electrical-v1',
                            declaredAt: '2026-01-01T00:00:00Z',
                            effectiveAt: '2026-01-01T00:00:00Z',
                            scale: 3,
                            bounds: {
                                minimum: -9007199254740991,
                                maximum: 9007199254740991,
                            },
                            resolution: 1,
                            freshnessMs: 90000,
                            historyAdmission: {
                                maximumObservations: 60,
                                intervalMs: 60000,
                            },
                        },
                    ],
                },
            ],
        }
        assert.deepEqual(
            bridgeCapabilityManifestSchema.parse(manifest),
            manifest
        )
    })

    it('accepts the golden observation report and rejects an unknown kind', () => {
        const report = {
            observationId: '2:1:1',
            observedAt: '2026-10-09T12:00:00Z',
            timeTrust: 'trustworthy',
            observations: [
                {
                    capabilityId: 'capability-plug-power',
                    identity: powerIdentity,
                    reading: {
                        status: 'value',
                        value: {
                            constraintRevisionId: 'matter-electrical-v1',
                            scale: 3,
                            value: 60000,
                        },
                    },
                },
            ],
        }
        assert.deepEqual(bridgeObservationReportSchema.parse(report), report)
        const unknown = {
            ...report,
            observations: report.observations.map((entry) => ({
                ...entry,
                identity: { ...powerIdentity, kind: 'frequency' },
            })),
        }
        assert.equal(
            bridgeObservationReportSchema.safeParse(unknown).success,
            false
        )
    })
})

/** What the Rust Matter adapter publishes for a plug (golden/matter-mqtt.json). */
const plug = {
    definition: {
        description: 'Matter on/off plug-in unit (Nemu Harness)',
        exposes: [
            {
                features: [
                    {
                        access: 7,
                        name: 'state',
                        property: 'state',
                        type: 'binary',
                        value_off: 'OFF',
                        value_on: 'ON',
                    },
                ],
                type: 'switch',
            },
        ],
        model: 'Harness Plug',
    },
    external_id: '2',
    friendly_name: 'Harness Plug',
    ieee_address: '2',
    supported: true,
    type: 'switch',
}

describe('Protocol adapter bridge payloads', () => {
    it('reads bridge/state', () => {
        assert.deepEqual(bridgeStateSchema.parse({ state: 'online' }), {
            state: 'online',
        })
        assert.throws(() => bridgeStateSchema.parse({ state: 'up' }))
    })

    it('reads a bridge/devices descriptor as the Rust adapter writes it', () => {
        assert.deepEqual(bridgeDeviceSchema.parse(plug), plug)
        assert.deepEqual(bridgeDevicesSchema.parse([]), [])
    })

    it('needs the fields Core reads from a descriptor', () => {
        const { ieee_address: _, ...withoutAddress } = plug
        assert.throws(() => bridgeDeviceSchema.parse(withoutAddress))
        assert.throws(() => bridgeDeviceSchema.parse({ ...plug, type: 7 }))
    })

    it('reads availability', () => {
        assert.deepEqual(bridgeAvailabilitySchema.parse({ state: 'offline' }), {
            state: 'offline',
        })
        assert.throws(() => bridgeAvailabilitySchema.parse({ state: 'gone' }))
    })

    it('reads a response with its transaction', () => {
        const ok = { status: 'ok', transaction: 'health-check' }
        const error = {
            error: 'pairing code is required',
            status: 'error',
            transaction: 'commission-without-code',
        }
        assert.deepEqual(bridgeResponseSchema.parse(ok), ok)
        assert.deepEqual(bridgeResponseSchema.parse(error), error)
        assert.throws(() => bridgeResponseSchema.parse({ status: 'error' }))
    })

    it('reads a command_failed event naming the Command', () => {
        const event = {
            type: 'command_failed',
            data: {
                ieee_address: '2',
                transaction: 'command-1',
                error: 'the device answered Failure',
            },
        }
        assert.deepEqual(bridgeEventSchema.parse(event), event)
    })

    it('reads a commissioning progress event', () => {
        const event = {
            type: 'device_interview',
            data: {
                ieee_address: 'commissioning',
                status: 'started',
                message: 'Looking for your device',
            },
        }
        assert.deepEqual(bridgeEventSchema.parse(event), event)
    })
})
