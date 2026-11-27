/**
 * Seam 2 for Meters: an attribute snapshot in, the canonical publication out.
 * Ported from the Rust adapter's `meters.rs` tests and the power cases in
 * `mapping.rs`, with the same fixtures and expected outputs.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    bridgeCapabilityManifestSchema,
    bridgeObservationReportSchema,
} from '@nemu/protocol'
import type { AttributeSnapshot } from '../attributes.ts'
import { BULB, HARNESS_PLUG } from '../mapping/fixtures.test-support.ts'
import { mapNode } from '../mapping/index.ts'
import {
    PLUG_UNDER_LOAD,
    PLUG_UNDER_LOAD_FIXTURE,
} from './fixtures.test-support.ts'
import {
    assignedCapabilityIds,
    deviceEnergyTimestamp,
    meterPublication,
    observationStamp,
    rfc3339Utc,
    selectObservedSeconds,
    verifiedPowerMilliwatts,
} from './publication.ts'

const STAMP = { observedAt: '2026-10-09T12:00:00Z', observationId: 'obs-1' }

function deviceOf(snapshot: AttributeSnapshot, nodeId = 'plug-1') {
    const device = mapNode(nodeId, snapshot)[0]
    assert.ok(device)
    return device
}

function publish(
    snapshot: AttributeSnapshot,
    ids: Record<string, string> = {},
    reset?: boolean
) {
    const publication = meterPublication(
        deviceOf(snapshot),
        snapshot,
        STAMP,
        ids,
        reset
    )
    assert.ok(publication)
    return publication
}

function observation(
    publication: ReturnType<typeof publish>,
    kind: string
): Record<string, unknown> & { reading: { value: { value: number } } } {
    const found = publication.report.observations.find(
        (entry) => entry.identity.kind === kind
    )
    assert.ok(found, `no ${kind} observation`)
    return found as never
}

describe('meterPublication', () => {
    it('reads RMS power under load, not a trustworthy zero', () => {
        const publication = publish(PLUG_UNDER_LOAD)
        const power = observation(publication, 'power')
        assert.equal(power.reading.value.value, 60_000)
        assert.equal(
            (power.reading.value as unknown as { scale: number }).scale,
            3
        )
        assert.deepEqual(
            publication.report.observations.map((entry) => entry.identity.kind),
            ['power', 'voltage', 'current', 'importedEnergy']
        )
        assert.equal(publication.report.observationId, 'obs-1')
        assert.equal(publication.report.schemaVersion, undefined)
        assert.deepEqual(
            publication.manifest.supportedObservationEnvelopeVersions,
            []
        )
    })

    it('stamps a returned Capability ID on the next envelope', () => {
        const assigned = assignedCapabilityIds({
            device: { protocol: 'matter', externalId: 'plug-1' },
            capabilities: [
                {
                    identity: {
                        kind: 'power',
                        physicalScope: { kind: 'device' },
                    },
                    capabilityId: '11111111-1111-1111-1111-111111111111',
                },
            ],
        })
        const power = observation(publish(PLUG_UNDER_LOAD, assigned), 'power')
        assert.equal(power.capabilityId, '11111111-1111-1111-1111-111111111111')
    })

    it('uses the adapter clock for the fixture and marks a reset only when asked', () => {
        const publication = publish(PLUG_UNDER_LOAD_FIXTURE, {}, true)
        assert.equal(publication.report.observedAt, '2026-10-09T12:00:00Z')
        const power = observation(publication, 'power')
        assert.equal(power.reading.value.value, 60_000)
        assert.equal(power.reset, true)
        assert.equal(publication.report.schemaVersion, undefined)
        assert.equal(
            observation(publish(PLUG_UNDER_LOAD_FIXTURE), 'power').reset,
            undefined
        )
    })

    it('has no envelope for a bulb without a meter', () => {
        assert.equal(
            meterPublication(deviceOf(BULB, 'bulb'), BULB, STAMP, {}),
            undefined
        )
    })

    it('matches the golden payloads for the harness plug', () => {
        const publication = publish(HARNESS_PLUG)
        assert.equal(
            bridgeCapabilityManifestSchema.safeParse(publication.manifest)
                .success,
            true
        )
        assert.equal(
            bridgeObservationReportSchema.safeParse(publication.report).success,
            true
        )
        assert.deepEqual(publication.manifest.capabilities[0], {
            identity: {
                device: { protocol: 'matter', externalId: 'plug-1' },
                componentPath: [],
                kind: 'power',
                physicalScope: { kind: 'device' },
            },
            unit: 'W',
            directionality: 'bidirectional',
            constraintRevisions: [
                {
                    revisionId: 'matter-electrical-v1',
                    declaredAt: '2026-01-01T00:00:00Z',
                    effectiveAt: '2026-01-01T00:00:00Z',
                    scale: 3,
                    bounds: {
                        minimum: -9_007_199_254_740_991,
                        maximum: 9_007_199_254_740_991,
                    },
                    resolution: 1,
                    freshnessMs: 90_000,
                    historyAdmission: {
                        maximumObservations: 60,
                        intervalMs: 60_000,
                    },
                },
            ],
        })
        assert.deepEqual(
            publication.report.observations.map((entry) => [
                entry.identity.kind,
                entry.reading.status === 'value'
                    ? entry.reading.value.value
                    : undefined,
            ]),
            [
                ['power', 60_000],
                ['voltage', 120_100],
                ['current', 500],
                ['importedEnergy', 1_500_000],
            ]
        )
        assert.equal(publication.report.timeTrust, 'trustworthy')
    })

    it('publishes a reset counter as its new absolute value, never a delta', () => {
        // A Device that rebooted (or a replaced meter) reports a lower
        // cumulative counter. The envelope carries the absolute reading and
        // Core starts a new Meter epoch on the decrease (meter_epoch.rs).
        const before = publish(HARNESS_PLUG)
        const after = publish({ ...HARNESS_PLUG, '2/145/1': { energy: 2_000 } })
        assert.equal(
            observation(before, 'importedEnergy').reading.value.value,
            1_500_000
        )
        assert.equal(
            observation(after, 'importedEnergy').reading.value.value,
            2_000
        )
        assert.equal(observation(after, 'importedEnergy').reset, undefined)
        assert.notEqual(before.fingerprint, after.fingerprint)
    })

    it('leaves out a negative or out-of-range energy counter', () => {
        for (const energy of [-5, '18446744073709551615', 1.5]) {
            const publication = publish({
                ...HARNESS_PLUG,
                '2/145/1': { energy },
            })
            assert.equal(
                publication.report.observations.some(
                    (entry) => entry.identity.kind === 'importedEnergy'
                ),
                false
            )
        }
    })

    it('publishes exported energy when the Device reports it', () => {
        const publication = publish({
            ...HARNESS_PLUG,
            '2/145/2': { energy: 42 },
        })
        assert.equal(
            observation(publication, 'exportedEnergy').reading.value.value,
            42
        )
    })

    it('falls back to RMS voltage and current', () => {
        const snapshot: Record<string, unknown> = { ...HARNESS_PLUG }
        delete snapshot['2/144/4']
        delete snapshot['2/144/5']
        snapshot['2/144/11'] = 230_000
        snapshot['2/144/12'] = 800
        const publication = publish(snapshot)
        assert.equal(
            observation(publication, 'voltage').reading.value.value,
            230_000
        )
        assert.equal(
            observation(publication, 'current').reading.value.value,
            800
        )
    })
})

describe('verifiedPowerMilliwatts', () => {
    it('does not let an unverified zero ActivePower hide a load', () => {
        assert.equal(
            verifiedPowerMilliwatts({ '1/144/8': 0, '1/144/13': 60_000 }, 1),
            60_000
        )
    })

    it('treats a lone zero ActivePower as no reading', () => {
        assert.equal(verifiedPowerMilliwatts({ '1/144/8': 0 }, 1), undefined)
    })

    it('keeps a corroborated zero as idle', () => {
        assert.equal(
            verifiedPowerMilliwatts({ '1/144/8': 0, '1/144/13': 0 }, 1),
            0
        )
    })

    it('uses the RMS load when ActivePower is null', () => {
        assert.equal(
            verifiedPowerMilliwatts({ '1/144/8': null, '1/144/13': 40_000 }, 1),
            40_000
        )
    })

    it('has no reading when the power attributes are missing', () => {
        assert.equal(verifiedPowerMilliwatts({ '1/6/0': true }, 1), undefined)
    })

    // TODO(NEM-113): the hardware spike has not run, so the root cause of the
    // live `0 W` defect is unknown. This pins the correct output for a plug
    // under load in the shape the matter.js session reports it. Confirm it
    // against the cause once the spike finds it, and add that exact case.
    it('reports nonzero power for a plug under load (0 W regression)', () => {
        const loaded = {
            ...HARNESS_PLUG,
            '2/144/8': 0,
            '2/144/13': 1_250_000,
        }
        const power = observation(publish(loaded), 'power')
        assert.equal(power.reading.value.value, 1_250_000)
        const active = observation(
            publish({ ...HARNESS_PLUG, '2/144/8': 1_250_000 }),
            'power'
        )
        assert.equal(active.reading.value.value, 1_250_000)
        const lone = publish({ ...HARNESS_PLUG, '2/144/8': 0 })
        assert.equal(
            lone.report.observations.some(
                (entry) => entry.identity.kind === 'power'
            ),
            false,
            'a lone 0 W must not be published as a reading'
        )
    })
})

describe('observation time', () => {
    it('formats Unix time as UTC', () => {
        assert.equal(rfc3339Utc(0), '1970-01-01T00:00:00Z')
        assert.equal(rfc3339Utc(1_700_000_000), '2023-11-14T22:13:20Z')
    })

    it('reuses a retained envelope, and a missing clock is not the epoch', () => {
        const previous = {
            fingerprint: 'power|device|=60000',
            observedAt: '2026-10-09T12:00:00Z',
            observationId: 'plug-1:1:1',
        }
        assert.deepEqual(
            observationStamp({
                deviceId: 'plug-1',
                sequence: 9,
                previous,
                fingerprint: previous.fingerprint,
                fresh: false,
            }),
            {
                observedAt: previous.observedAt,
                observationId: previous.observationId,
            }
        )
        assert.equal(
            observationStamp({
                deviceId: 'plug-1',
                sequence: 9,
                previous,
                fingerprint: 'changed',
                fresh: true,
            }),
            undefined
        )
        assert.deepEqual(
            observationStamp({
                deviceId: 'plug-1',
                sequence: 2,
                now: { seconds: 1_700_000_000, millis: 1_700_000_000_000 },
                previous,
                fingerprint: previous.fingerprint,
                fresh: true,
            }),
            {
                observedAt: '2023-11-14T22:13:20Z',
                observationId: 'plug-1:1700000000000:2',
            }
        )
    })

    it('accepts a Device timestamp only for a verified profile', () => {
        const device = deviceOf(PLUG_UNDER_LOAD_FIXTURE)
        assert.equal(
            deviceEnergyTimestamp(device, PLUG_UNDER_LOAD_FIXTURE),
            1_700_000_000
        )
        const adapterUnix = 1_800_000_000
        assert.equal(
            selectObservedSeconds(1_700_000_000, adapterUnix, false),
            adapterUnix
        )
        assert.equal(
            selectObservedSeconds(1_700_000_000, adapterUnix, true),
            1_700_000_000
        )
        assert.equal(
            selectObservedSeconds(undefined, adapterUnix, true),
            adapterUnix
        )
        const publication = meterPublication(
            device,
            PLUG_UNDER_LOAD_FIXTURE,
            {
                observedAt: '2026-10-09T12:00:00Z',
                observationId: 'obs-fixture',
            },
            {}
        )
        assert.equal(publication?.report.observedAt, '2026-10-09T12:00:00Z')
    })
})
