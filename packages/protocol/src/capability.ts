import { z } from 'zod'

const MAX_FIXED_POINT_SCALE = 9
const MAX_ENVELOPE_SCHEMA_VERSION = 65_535
const MAX_RELATIVE_ERROR_PPM = 1_000_000

const nonEmptyIdSchema = z.string().trim().min(1).max(255)

export const capabilityIdSchema = nonEmptyIdSchema.brand<'CapabilityId'>()
export type CapabilityId = z.infer<typeof capabilityIdSchema>

export const capabilityConstraintRevisionIdSchema =
    nonEmptyIdSchema.brand<'CapabilityConstraintRevisionId'>()
export type CapabilityConstraintRevisionId = z.infer<
    typeof capabilityConstraintRevisionIdSchema
>

export const capabilityKindSchema = z.enum([
    'power',
    'importedEnergy',
    'exportedEnergy',
    'voltage',
    'current',
])
export type CapabilityKind = z.infer<typeof capabilityKindSchema>

export const canonicalUnitSchema = z.enum(['W', 'Wh', 'V', 'A'])
export type CanonicalUnit = z.infer<typeof canonicalUnitSchema>

export const capabilityDirectionalitySchema = z.enum([
    'nonnegative',
    'bidirectional',
])
export type CapabilityDirectionality = z.infer<
    typeof capabilityDirectionalitySchema
>

export const capabilityPhysicalScopeSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('home') }),
    z.strictObject({ kind: z.literal('device') }),
    z.strictObject({
        kind: z.literal('component'),
        componentId: nonEmptyIdSchema,
    }),
])
export type CapabilityPhysicalScope = z.infer<
    typeof capabilityPhysicalScopeSchema
>

const fixedPointIntegerSchema = z.number().int().safe()
const nonnegativeFixedPointIntegerSchema = fixedPointIntegerSchema.nonnegative()

export const fixedPointScaleSchema = z
    .number()
    .int()
    .min(0)
    .max(MAX_FIXED_POINT_SCALE)
export type FixedPointScale = z.infer<typeof fixedPointScaleSchema>

export const capabilityAccuracySchema = z.discriminatedUnion('kind', [
    z.strictObject({
        kind: z.literal('absolute'),
        maximumError: nonnegativeFixedPointIntegerSchema,
    }),
    z.strictObject({
        kind: z.literal('relative'),
        maximumErrorPpm: z.number().int().min(0).max(MAX_RELATIVE_ERROR_PPM),
    }),
    z.strictObject({
        kind: z.literal('absoluteAndRelative'),
        absoluteMaximumError: nonnegativeFixedPointIntegerSchema,
        relativeMaximumErrorPpm: z
            .number()
            .int()
            .min(0)
            .max(MAX_RELATIVE_ERROR_PPM),
    }),
])
export type CapabilityAccuracy = z.infer<typeof capabilityAccuracySchema>

export const capabilityConstraintRevisionSchema = z
    .strictObject({
        revisionId: capabilityConstraintRevisionIdSchema,
        effectiveAt: z.iso.datetime({ offset: true }),
        scale: fixedPointScaleSchema,
        bounds: z.strictObject({
            minimum: fixedPointIntegerSchema,
            maximum: fixedPointIntegerSchema,
        }),
        resolution: z.number().int().safe().positive(),
        freshnessMs: z.number().int().safe().positive(),
        historyAdmission: z.strictObject({
            maximumObservations: z.number().int().safe().positive(),
            intervalMs: z.number().int().safe().positive(),
        }),
        accuracy: capabilityAccuracySchema.optional(),
    })
    .superRefine((revision, context) => {
        const { minimum, maximum } = revision.bounds
        if (minimum >= maximum) {
            context.addIssue({
                code: 'custom',
                message: 'minimum must be less than maximum',
                path: ['bounds'],
            })
            return
        }

        const span = BigInt(maximum) - BigInt(minimum)
        if (BigInt(revision.resolution) > span) {
            context.addIssue({
                code: 'custom',
                message: 'resolution cannot exceed the bounded value range',
                path: ['resolution'],
            })
        }
    })
export type CapabilityConstraintRevision = z.infer<
    typeof capabilityConstraintRevisionSchema
>

const capabilityFields = {
    id: capabilityIdSchema,
    physicalScope: capabilityPhysicalScopeSchema,
    readable: z.literal(true),
    writable: z.literal(false),
    constraintRevisions: z.array(capabilityConstraintRevisionSchema).min(1),
}

export const numericCapabilitySchema = z
    .discriminatedUnion('kind', [
        z.strictObject({
            ...capabilityFields,
            kind: z.literal('power'),
            unit: z.literal('W'),
            directionality: capabilityDirectionalitySchema,
        }),
        z.strictObject({
            ...capabilityFields,
            kind: z.literal('importedEnergy'),
            unit: z.literal('Wh'),
            directionality: z.literal('nonnegative'),
        }),
        z.strictObject({
            ...capabilityFields,
            kind: z.literal('exportedEnergy'),
            unit: z.literal('Wh'),
            directionality: z.literal('nonnegative'),
        }),
        z.strictObject({
            ...capabilityFields,
            kind: z.literal('voltage'),
            unit: z.literal('V'),
            directionality: z.literal('nonnegative'),
        }),
        z.strictObject({
            ...capabilityFields,
            kind: z.literal('current'),
            unit: z.literal('A'),
            directionality: z.literal('nonnegative'),
        }),
    ])
    .superRefine((capability, context) => {
        const revisionIds = new Set<string>()
        let previousEffectiveAt = Number.NEGATIVE_INFINITY

        for (const [
            index,
            revision,
        ] of capability.constraintRevisions.entries()) {
            if (revisionIds.has(revision.revisionId)) {
                context.addIssue({
                    code: 'custom',
                    message: 'constraint revision identities must be unique',
                    path: ['constraintRevisions', index, 'revisionId'],
                })
            }
            revisionIds.add(revision.revisionId)

            const effectiveAt = Date.parse(revision.effectiveAt)
            if (effectiveAt <= previousEffectiveAt) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'constraint revisions must have increasing effective times',
                    path: ['constraintRevisions', index, 'effectiveAt'],
                })
            }
            previousEffectiveAt = effectiveAt

            const { minimum, maximum } = revision.bounds
            if (capability.directionality === 'nonnegative' && minimum < 0) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'nonnegative Capabilities cannot declare negative bounds',
                    path: ['constraintRevisions', index, 'bounds', 'minimum'],
                })
            }
            if (
                capability.directionality === 'bidirectional' &&
                (minimum >= 0 || maximum <= 0)
            ) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'bidirectional Capabilities must allow negative and positive values',
                    path: ['constraintRevisions', index, 'bounds'],
                })
            }
        }
    })
export type NumericCapability = z.infer<typeof numericCapabilitySchema>

export const numericCapabilityValueSchema = z.strictObject({
    value: fixedPointIntegerSchema,
    scale: fixedPointScaleSchema,
    constraintRevisionId: capabilityConstraintRevisionIdSchema,
})
export type NumericCapabilityValue = z.infer<
    typeof numericCapabilityValueSchema
>

export function parseNumericCapabilityValue({
    capability,
    value,
}: {
    capability: NumericCapability
    value: unknown
}): NumericCapabilityValue {
    return numericCapabilityValueSchema
        .superRefine((candidate, context) => {
            const revision = capability.constraintRevisions.find(
                ({ revisionId }) =>
                    revisionId === candidate.constraintRevisionId
            )
            if (revision === undefined) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'constraint revision is not declared by the Capability',
                    path: ['constraintRevisionId'],
                })
                return
            }

            if (candidate.scale !== revision.scale) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'value scale does not match its constraint revision',
                    path: ['scale'],
                })
            }

            const { minimum, maximum } = revision.bounds
            if (candidate.value < minimum || candidate.value > maximum) {
                context.addIssue({
                    code: 'custom',
                    message: 'value is outside its Capability bounds',
                    path: ['value'],
                })
                return
            }

            const offset = BigInt(candidate.value) - BigInt(minimum)
            if (offset % BigInt(revision.resolution) !== 0n) {
                context.addIssue({
                    code: 'custom',
                    message: 'value does not align with Capability resolution',
                    path: ['value'],
                })
            }
        })
        .parse(value)
}

export const observationEnvelopeSchemaVersionSchema = z
    .number()
    .int()
    .min(1)
    .max(MAX_ENVELOPE_SCHEMA_VERSION)
    .brand<'ObservationEnvelopeSchemaVersion'>()
export type ObservationEnvelopeSchemaVersion = z.infer<
    typeof observationEnvelopeSchemaVersionSchema
>

const supportedObservationEnvelopeVersionsSchema = z
    .array(observationEnvelopeSchemaVersionSchema)
    .min(1)
    .superRefine((versions, context) => {
        for (let index = 1; index < versions.length; index += 1) {
            const previous = versions[index - 1]
            const current = versions[index]
            if (
                previous !== undefined &&
                current !== undefined &&
                current <= previous
            ) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'envelope schema versions must be unique and increasing',
                    path: [index],
                })
            }
        }
    })

export const capabilityManifestSchema = z
    .strictObject({
        schemaVersion: z.literal(1),
        supportedObservationEnvelopeVersions:
            supportedObservationEnvelopeVersionsSchema,
        capabilities: z.array(numericCapabilitySchema),
    })
    .superRefine((manifest, context) => {
        const capabilityIds = new Set<string>()
        for (const [index, capability] of manifest.capabilities.entries()) {
            if (capabilityIds.has(capability.id)) {
                context.addIssue({
                    code: 'custom',
                    message:
                        'Capability identities must be unique in a manifest',
                    path: ['capabilities', index, 'id'],
                })
            }
            capabilityIds.add(capability.id)
        }
    })
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>

export type ObservationEnvelopeVersionNegotiation =
    | {
          status: 'compatible'
          version: ObservationEnvelopeSchemaVersion
      }
    | { status: 'incompatible' }

export function negotiateObservationEnvelopeVersion({
    local,
    remote,
}: {
    local: CapabilityManifest
    remote: CapabilityManifest
}): ObservationEnvelopeVersionNegotiation {
    const remoteVersions = new Set(remote.supportedObservationEnvelopeVersions)
    for (
        let index = local.supportedObservationEnvelopeVersions.length - 1;
        index >= 0;
        index -= 1
    ) {
        const version = local.supportedObservationEnvelopeVersions[index]
        if (version !== undefined && remoteVersions.has(version)) {
            return { status: 'compatible', version }
        }
    }

    return { status: 'incompatible' }
}
