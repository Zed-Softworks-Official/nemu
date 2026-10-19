import { z } from 'zod'

export const historyResolutionSchema = z.enum([
    'raw',
    'one_minute',
    'five_minute',
    'fifteen_minute',
    'hourly',
    'daily',
    'monthly',
])
export type HistoryResolution = z.infer<typeof historyResolutionSchema>

export const historyMetricSchema = z.enum([
    'power',
    'importedEnergy',
    'exportedEnergy',
    'voltage',
    'current',
])
export type HistoryMetric = z.infer<typeof historyMetricSchema>

export const historyScopeSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('capability'),
        capabilityId: z.string().uuid(),
    }),
    z.object({
        type: z.literal('device'),
        deviceId: z.string().uuid(),
    }),
    z.object({
        type: z.literal('component'),
        deviceId: z.string().uuid(),
        componentPath: z.array(z.string().min(1)).min(1),
    }),
    z.object({
        type: z.literal('home'),
    }),
])
export type HistoryScope = z.infer<typeof historyScopeSchema>

export const historyQueryFields = {
    scope: historyScopeSchema,
    metric: historyMetricSchema,
    start: z.string().datetime(),
    end: z.string().datetime(),
    resolution: historyResolutionSchema,
    freshnessLimitMs: z.number().int().positive(),
    maxPoints: z.number().int().positive().max(1000),
    cursor: z.string().min(1).optional(),
    /** Home queries may rank downstream contributors on this same response. */
    breakdown: z.boolean().optional(),
}

export const historyQueryMessageSchema = z.object({
    type: z.literal('historyQuery'),
    ...historyQueryFields,
})
export type HistoryQueryMessage = z.infer<typeof historyQueryMessageSchema>

/** Same historyQuery type. Core already stored the query on the cursor. */
export const historyCursorMessageSchema = z.object({
    type: z.literal('historyQuery'),
    cursor: z.string().min(1),
})
export type HistoryCursorMessage = z.infer<typeof historyCursorMessageSchema>

export const historyQuerySchema = z.object(historyQueryFields)
export type HistoryQuery = z.infer<typeof historyQuerySchema>

const historyIntervalSchema = z.object({
    kind: z.enum(['history', 'missing', 'stale', 'rejected', 'unavailable']),
    start: z.string().datetime(),
    end: z.string().datetime(),
    reason: z
        .enum([
            'untrusted_time',
            'storage_failure',
            'queue_loss',
            'disk_floor',
            'restore',
        ])
        .optional(),
})

const coverageSchema = z.object({
    coveredNs: z.number().int().nonnegative(),
    elapsedNs: z.number().int().nonnegative(),
})

export const historySeriesSchema = z.object({
    capabilityId: z.string().uuid(),
    label: z.string(),
    resolution: historyResolutionSchema,
    sourceResolution: historyResolutionSchema,
    provenance: z.enum(['measured', 'estimated']),
    coverage: coverageSchema,
    recordingSince: z.string().datetime(),
    availableSince: z.string().datetime().nullable(),
    meterEpochBoundaries: z.array(z.string().datetime()),
    designationBoundaries: z.array(z.string().datetime()).default([]),
    gaps: z.array(historyIntervalSchema),
    missing: z.array(historyIntervalSchema),
    points: z
        .array(
            z.object({
                start: z.string().datetime(),
                end: z.string().datetime(),
                value: z.number().int(),
                scale: z.number().int().nonnegative(),
                provenance: z.enum(['measured', 'estimated']),
                coverage: coverageSchema,
                partial: z.boolean().optional(),
            })
        )
        .max(1000),
})

const historyHealthSchema = z.object({
    status: z.enum(['ok', 'degraded']),
    gapAccounting: z.enum(['certain', 'uncertain']),
    lossWarning: z.boolean(),
    queue: z.object({
        queued: z.number().int().nonnegative(),
        inflight: z.number().int().nonnegative(),
        capacity: z.number().int().nonnegative(),
        pressured: z.boolean(),
    }),
    gaps: z.array(
        z.object({
            reason: z.string(),
            capabilityId: z.string().uuid().nullable(),
            onset: z.string().datetime(),
            until: z.string().datetime().nullable(),
        })
    ),
})

const contributorRankingSchema = z.object({
    capabilityId: z.string().uuid(),
    label: z.string(),
    rank: z.number().int().positive().nullable(),
    value: z.number().int().nullable(),
    scale: z.number().int().nonnegative(),
    percentageBasisPoints: z.number().int().optional(),
})

const unattributedShareSchema = z.object({
    value: z.number().int(),
    scale: z.number().int().nonnegative(),
    percentageBasisPoints: z.number().int().optional(),
    withinMeterTolerance: z.boolean(),
})

export const contributorBreakdownSchema = z.object({
    consuming: z.array(contributorRankingSchema),
    producing: z.array(contributorRankingSchema),
    unattributed: unattributedShareSchema.optional(),
    status: z.enum([
        'rankingsOnly',
        'attributed',
        'withinMeterTolerance',
        'inconsistent',
    ]),
})
export type ContributorBreakdown = z.infer<typeof contributorBreakdownSchema>

export const historyQueryResultSchema = z.object({
    type: z.literal('historyQueryResult'),
    requestId: z.string(),
    asOf: z.string().datetime(),
    incomplete: z.boolean(),
    nextCursor: z.string().min(1).optional(),
    series: z.array(historySeriesSchema).max(20),
    reasons: z.array(z.enum(['gap', 'coverage'])),
    health: historyHealthSchema.optional(),
    breakdown: contributorBreakdownSchema.optional(),
})
export type HistoryQueryResult = z.infer<typeof historyQueryResultSchema>

export const historyQueryRestartSchema = z.object({
    type: z.literal('historyQueryRestart'),
    requestId: z.string(),
    reason: z.enum(['cursor_expired', 'cursor_unknown']),
})
export type HistoryQueryRestart = z.infer<typeof historyQueryRestartSchema>

export const historyQueryReadSchema = z.discriminatedUnion('type', [
    historyQueryResultSchema,
    historyQueryRestartSchema,
])
export type HistoryQueryRead = z.infer<typeof historyQueryReadSchema>

const optionalCapabilityId = z.string().uuid().nullable().optional()

export const homeMeterDesignationSelectionSchema = z.object({
    powerCapabilityId: optionalCapabilityId,
    importedEnergyCapabilityId: optionalCapabilityId,
    exportedEnergyCapabilityId: optionalCapabilityId,
})
export type HomeMeterDesignationSelection = z.infer<
    typeof homeMeterDesignationSelectionSchema
>

export const designateHomeMeterMessageSchema =
    homeMeterDesignationSelectionSchema.extend({
        type: z.literal('designateHomeMeter'),
    })
export type DesignateHomeMeterMessage = z.infer<
    typeof designateHomeMeterMessageSchema
>

export const getHomeMeterDesignationMessageSchema = z.object({
    type: z.literal('getHomeMeterDesignation'),
})
export type GetHomeMeterDesignationMessage = z.infer<
    typeof getHomeMeterDesignationMessageSchema
>

export const homeMeterDesignationSchema = z.object({
    id: z.string().uuid(),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().nullable(),
    powerCapabilityId: z.string().uuid().nullable(),
    importedEnergyCapabilityId: z.string().uuid().nullable(),
    exportedEnergyCapabilityId: z.string().uuid().nullable(),
    protocol: z.string().min(1),
    deviceExternalId: z.string().min(1),
    componentPath: z.array(z.string()),
    physicalScopeKind: z.enum(['home', 'device', 'component']),
    physicalScopeComponentId: z.string(),
})
export type HomeMeterDesignation = z.infer<typeof homeMeterDesignationSchema>

export const exportHistoryBackupMessageSchema = z.object({
    type: z.literal('exportHistoryBackup'),
})
export type ExportHistoryBackupMessage = z.infer<
    typeof exportHistoryBackupMessageSchema
>

export const importHistoryBackupMessageSchema = z.object({
    type: z.literal('importHistoryBackup'),
    /** Ciphertext. The Controller keeps the backup key. */
    archive: z.string().min(1),
})
export type ImportHistoryBackupMessage = z.infer<
    typeof importHistoryBackupMessageSchema
>

export const historyBackupResultSchema = z.object({
    type: z.literal('historyBackup'),
    requestId: z.string(),
    archive: z.string().min(1),
})
export type HistoryBackupResult = z.infer<typeof historyBackupResultSchema>

export const historyBackupRestoredSchema = z.object({
    type: z.literal('historyBackupRestored'),
    requestId: z.string(),
})
export type HistoryBackupRestored = z.infer<typeof historyBackupRestoredSchema>

export const homeMeterDesignationResultSchema = z.object({
    type: z.literal('homeMeterDesignation'),
    requestId: z.string(),
    designation: homeMeterDesignationSchema.nullable(),
})
export type HomeMeterDesignationResult = z.infer<
    typeof homeMeterDesignationResultSchema
>
