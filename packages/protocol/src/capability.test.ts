import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    capabilityManifestSchema,
    negotiateObservationEnvelopeVersion,
    numericCapabilitySchema,
    parseNumericCapabilityValue,
} from './capability.js'
import { deviceStateSchema } from './device.js'

const baseRevision = {
    revisionId: 'limits-2026-09-11',
    effectiveAt: '2026-09-11T20:00:00.000Z',
    scale: 3,
    bounds: {
        minimum: 0,
        maximum: 1_000_000,
    },
    resolution: 1,
    freshnessMs: 60_000,
    historyAdmission: {
        maximumObservations: 60,
        intervalMs: 60_000,
    },
}

function capability(
    kind: string,
    unit: string,
    directionality = 'nonnegative'
): Record<string, unknown> {
    return {
        id: `capability-${kind}`,
        kind,
        physicalScope: { kind: 'device' },
        unit,
        directionality,
        readable: true,
        writable: false,
        constraintRevisions: [baseRevision],
    }
}

describe('numeric Capability contract', () => {
    it('accepts every stable kind with its canonical unit', () => {
        const cases = [
            ['power', 'W'],
            ['importedEnergy', 'Wh'],
            ['exportedEnergy', 'Wh'],
            ['voltage', 'V'],
            ['current', 'A'],
        ] as const

        for (const [kind, unit] of cases) {
            assert.equal(
                numericCapabilitySchema.parse(capability(kind, unit)).kind,
                kind
            )
        }
    })

    it('rejects unknown kinds and mismatched canonical units', () => {
        assert.equal(
            numericCapabilitySchema.safeParse(capability('unknown', 'W'))
                .success,
            false
        )
        assert.equal(
            numericCapabilitySchema.safeParse(capability('power', 'Wh'))
                .success,
            false
        )
        assert.equal(
            numericCapabilitySchema.safeParse(capability('voltage', 'A'))
                .success,
            false
        )
    })

    it('keeps physical scope explicit', () => {
        const home = numericCapabilitySchema.parse({
            ...capability('power', 'W'),
            physicalScope: { kind: 'home' },
        })
        const component = numericCapabilitySchema.parse({
            ...capability('current', 'A'),
            physicalScope: {
                kind: 'component',
                componentId: 'outlet-1',
            },
        })

        assert.equal(home.physicalScope.kind, 'home')
        assert.deepEqual(component.physicalScope, {
            kind: 'component',
            componentId: 'outlet-1',
        })
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('current', 'A'),
                physicalScope: { kind: 'component' },
            }).success,
            false
        )
    })

    it('rejects invalid scales, bounds, resolution, and freshness', () => {
        const invalidRevisions = [
            { ...baseRevision, scale: -1 },
            { ...baseRevision, scale: 10 },
            {
                ...baseRevision,
                bounds: { minimum: 10, maximum: 10 },
            },
            { ...baseRevision, resolution: 0 },
            { ...baseRevision, resolution: 1_000_001 },
            { ...baseRevision, freshnessMs: 0 },
            {
                ...baseRevision,
                historyAdmission: {
                    maximumObservations: 0,
                    intervalMs: 60_000,
                },
            },
        ]

        for (const revision of invalidRevisions) {
            assert.equal(
                numericCapabilitySchema.safeParse({
                    ...capability('power', 'W'),
                    constraintRevisions: [revision],
                }).success,
                false
            )
        }
    })

    it('enforces directionality against every constraint revision', () => {
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('power', 'W'),
                constraintRevisions: [
                    {
                        ...baseRevision,
                        bounds: { minimum: -1, maximum: 100 },
                    },
                ],
            }).success,
            false
        )
        assert.equal(
            numericCapabilitySchema.safeParse(
                capability('power', 'W', 'bidirectional')
            ).success,
            false
        )
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('power', 'W', 'bidirectional'),
                constraintRevisions: [
                    {
                        ...baseRevision,
                        bounds: { minimum: -1_000_000, maximum: 1_000_000 },
                    },
                ],
            }).success,
            true
        )
        assert.equal(
            numericCapabilitySchema.safeParse(
                capability('importedEnergy', 'Wh', 'bidirectional')
            ).success,
            false
        )
    })

    it('models absolute, relative, and combined accuracy', () => {
        const accuracies = [
            { kind: 'absolute', maximumError: 5 },
            { kind: 'relative', maximumErrorPpm: 10_000 },
            {
                kind: 'absoluteAndRelative',
                absoluteMaximumError: 5,
                relativeMaximumErrorPpm: 10_000,
            },
        ]

        for (const accuracy of accuracies) {
            assert.equal(
                numericCapabilitySchema.safeParse({
                    ...capability('voltage', 'V'),
                    constraintRevisions: [{ ...baseRevision, accuracy }],
                }).success,
                true
            )
        }

        const invalidAccuracies = [
            { kind: 'absolute' },
            { kind: 'absolute', maximumError: -1 },
            { kind: 'relative', maximumErrorPpm: 1_000_001 },
        ]
        for (const accuracy of invalidAccuracies) {
            assert.equal(
                numericCapabilitySchema.safeParse({
                    ...capability('voltage', 'V'),
                    constraintRevisions: [{ ...baseRevision, accuracy }],
                }).success,
                false
            )
        }
    })

    it('gives revisions stable identities and ordered effective times', () => {
        const nextRevision = {
            ...baseRevision,
            revisionId: 'limits-2026-10-01',
            effectiveAt: '2026-10-01T00:00:00.000Z',
            freshnessMs: 30_000,
        }
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('power', 'W'),
                constraintRevisions: [baseRevision, nextRevision],
            }).success,
            true
        )
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('power', 'W'),
                constraintRevisions: [
                    baseRevision,
                    { ...nextRevision, revisionId: baseRevision.revisionId },
                ],
            }).success,
            false
        )
        assert.equal(
            numericCapabilitySchema.safeParse({
                ...capability('power', 'W'),
                constraintRevisions: [nextRevision, baseRevision],
            }).success,
            false
        )
    })

    it('validates fixed-point values against the named revision', () => {
        const parsedCapability = numericCapabilitySchema.parse(
            capability('power', 'W')
        )

        assert.deepEqual(
            parseNumericCapabilityValue({
                capability: parsedCapability,
                value: {
                    value: 12_345,
                    scale: 3,
                    constraintRevisionId: baseRevision.revisionId,
                },
            }),
            {
                value: 12_345,
                scale: 3,
                constraintRevisionId: baseRevision.revisionId,
            }
        )

        const invalidValues = [
            {
                value: -1,
                scale: 3,
                constraintRevisionId: baseRevision.revisionId,
            },
            {
                value: 12_345,
                scale: 2,
                constraintRevisionId: baseRevision.revisionId,
            },
            {
                value: 12_345.5,
                scale: 3,
                constraintRevisionId: baseRevision.revisionId,
            },
            {
                value: 12_345,
                scale: 3,
                constraintRevisionId: 'unknown-revision',
            },
        ]

        for (const value of invalidValues) {
            assert.throws(() =>
                parseNumericCapabilityValue({
                    capability: parsedCapability,
                    value,
                })
            )
        }

        const steppedCapability = numericCapabilitySchema.parse({
            ...capability('power', 'W'),
            constraintRevisions: [{ ...baseRevision, resolution: 5 }],
        })
        assert.throws(() =>
            parseNumericCapabilityValue({
                capability: steppedCapability,
                value: {
                    value: 12_343,
                    scale: 3,
                    constraintRevisionId: baseRevision.revisionId,
                },
            })
        )
    })
})

describe('Capability manifest negotiation', () => {
    function manifest(supportedObservationEnvelopeVersions: number[]) {
        return capabilityManifestSchema.parse({
            schemaVersion: 1,
            supportedObservationEnvelopeVersions,
            capabilities: [capability('power', 'W')],
        })
    }

    it('selects the highest mutually supported envelope version', () => {
        assert.deepEqual(
            negotiateObservationEnvelopeVersion({
                local: manifest([1, 2, 4]),
                remote: manifest([2, 3, 4]),
            }),
            { status: 'compatible', version: 4 }
        )
        assert.deepEqual(
            negotiateObservationEnvelopeVersion({
                local: manifest([1]),
                remote: manifest([2]),
            }),
            { status: 'incompatible' }
        )
    })

    it('rejects empty, duplicate, or unordered version lists', () => {
        for (const versions of [[], [1, 1], [2, 1]]) {
            assert.equal(
                capabilityManifestSchema.safeParse({
                    schemaVersion: 1,
                    supportedObservationEnvelopeVersions: versions,
                    capabilities: [],
                }).success,
                false
            )
        }
    })

    it('rejects duplicate Capability identities', () => {
        assert.equal(
            capabilityManifestSchema.safeParse({
                schemaVersion: 1,
                supportedObservationEnvelopeVersions: [1],
                capabilities: [
                    capability('power', 'W'),
                    capability('power', 'W'),
                ],
            }).success,
            false
        )
    })
})

describe('legacy state compatibility', () => {
    it('keeps arbitrary legacy Device state available', () => {
        assert.deepEqual(
            deviceStateSchema.parse({
                power: 12.5,
                energy: 3.2,
                vendorSpecific: { mode: 'eco' },
            }),
            {
                power: 12.5,
                energy: 3.2,
                vendorSpecific: { mode: 'eco' },
            }
        )
    })
})
