import { ManualPairingCodeCodec } from '@matter/main/types'
import { type DeviceKind, SECOND_LOAD } from './fixtures.ts'
import { normaliseStep, type StepRecord } from './normalise.ts'
import type { Adapter, SimulatedDevice } from './processes.ts'
import type { Received, Recorder } from './recorder.ts'
import { includesStep, includesTopic, type Scope } from './scope.ts'

export interface Harness {
    recorder: Recorder
    adapter: Adapter
    devices: Record<DeviceKind, SimulatedDevice>
    /** Node ID to Device name, filled in as each Device is commissioned. */
    names: Record<string, string>
    /** Device ID the adapter published for each simulated Device. */
    ids: Partial<Record<DeviceKind, string>>
    /** The steps and topics this run checks. */
    scope: Scope
}

interface Step {
    name: string
    act(harness: Harness): Promise<void>
    /** The step is done once this holds over its messages and they have gone quiet. */
    until?(messages: readonly Received[], harness: Harness): boolean
    /** Time to keep recording even if `until` already holds. */
    minMs?: number
    timeoutMs?: number
}

const QUIET_MS = Number(process.env.MATTER_HARNESS_QUIET_MS ?? 3_000)
const OFFLINE_MS = Number(process.env.MATTER_HARNESS_OFFLINE_MS ?? 45_000)

const latest = (messages: readonly Received[], topic: string): unknown => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.topic === topic)
            return message.payload === '' ? null : JSON.parse(message.payload)
    }
    return undefined
}

const responded =
    (endpoint: string, transaction: string) =>
    (messages: readonly Received[]) =>
        messages.some(
            (message) =>
                message.topic === `bridge/response/${endpoint}` &&
                (JSON.parse(message.payload) as { transaction?: string })
                    .transaction === transaction
        )

function deviceId(harness: Harness, kind: DeviceKind): string {
    const id = harness.ids[kind]
    if (!id) throw new Error(`${kind} has not been commissioned`)
    return id
}

const stateOf = (
    harness: Harness,
    kind: DeviceKind,
    messages: readonly Received[]
) =>
    latest(messages, deviceId(harness, kind)) as
        | Record<string, unknown>
        | null
        | undefined

const stateIs =
    (kind: DeviceKind, expected: Record<string, unknown>) =>
    (messages: readonly Received[], harness: Harness) => {
        const state = stateOf(harness, kind, messages)
        return (
            !!state &&
            Object.entries(expected).every(
                ([key, value]) => state[key] === value
            )
        )
    }

/** Learns the new Device's ID and node ID from `bridge/devices`. */
const commissioned =
    (kind: DeviceKind) => (messages: readonly Received[], harness: Harness) => {
        if (harness.ids[kind]) return true
        const devices = latest(messages, 'bridge/devices') as
            | { external_id: string }[]
            | undefined
        const known = new Set(Object.values(harness.ids))
        const fresh = devices?.find((device) => !known.has(device.external_id))
        if (!fresh) return false
        const nodeId = /^\d+/.exec(fresh.external_id)?.[0]
        if (!nodeId)
            throw new Error(`cannot read a node ID from ${fresh.external_id}`)
        harness.ids[kind] = fresh.external_id
        harness.names[nodeId] = kind
        return true
    }

const set =
    (kind: DeviceKind, transaction: string, payload: Record<string, unknown>) =>
    (harness: Harness) =>
        harness.recorder.publish(`${deviceId(harness, kind)}/set`, {
            ...payload,
            transaction,
        })

/** An absent Device, so a commission attempt is still running when it is cancelled. */
const ABSENT_DEVICE_CODE = ManualPairingCodeCodec.encode({
    discriminator: 2304,
    passcode: 20202023,
})

export const STEPS: Step[] = [
    {
        name: 'adapter-starts',
        act: async () => {},
        until: (messages) => latest(messages, 'bridge/devices') !== undefined,
    },
    {
        name: 'commission-plug',
        act: (harness) =>
            harness.recorder.publish('bridge/request/commission', {
                code: harness.devices.plug.manualPairingCode,
                transaction: 'commission-plug',
            }),
        until: (messages, harness) => {
            if (!commissioned('plug')(messages, harness)) return false
            const id = deviceId(harness, 'plug')
            // Wait for the first reading, unless this run leaves meters out.
            return includesTopic(harness.scope, `${id}/observations`)
                ? latest(messages, `${id}/observations`) !== undefined
                : latest(messages, id) !== undefined
        },
        timeoutMs: 120_000,
    },
    {
        name: 'assign-plug-capability-ids',
        act: async (harness) => {
            const id = deviceId(harness, 'plug')
            const manifest = latest(
                harness.recorder.messages,
                `${id}/capabilities`
            ) as {
                capabilities: { identity: { kind: string } }[]
            }
            await harness.recorder.publish(`${id}/capability-ids`, {
                capabilities: manifest.capabilities.map((capability) => ({
                    identity: capability.identity,
                    capabilityId: `capability-plug-${capability.identity.kind}`,
                })),
            })
        },
        // The Rust adapter applies assigned IDs from the next fresh observation on.
        minMs: 5_000,
    },
    {
        name: 'plug-on',
        act: set('plug', 'plug-on', { state: 'ON' }),
        until: stateIs('plug', { state: 'ON' }),
    },
    {
        name: 'plug-off',
        act: set('plug', 'plug-off', { state: 'OFF' }),
        until: stateIs('plug', { state: 'OFF' }),
    },
    {
        name: 'plug-load-changes',
        act: async (harness) => harness.devices.plug.setPower(SECOND_LOAD),
        until: (messages, harness) =>
            JSON.stringify(
                latest(messages, `${deviceId(harness, 'plug')}/observations`) ??
                    ''
            ).includes(String(SECOND_LOAD.energyImported)),
    },
    {
        name: 'commission-light',
        act: (harness) =>
            harness.recorder.publish('bridge/request/commission', {
                code: harness.devices.light.manualPairingCode,
                transaction: 'commission-light',
            }),
        until: (messages, harness) =>
            commissioned('light')(messages, harness) &&
            latest(messages, deviceId(harness, 'light')) !== undefined,
        timeoutMs: 120_000,
    },
    {
        name: 'light-on',
        act: set('light', 'light-on', { state: 'ON' }),
        until: stateIs('light', { state: 'ON' }),
    },
    {
        name: 'light-brightness',
        act: set('light', 'light-brightness', { brightness: 150 }),
        until: stateIs('light', { brightness: 150 }),
    },
    {
        name: 'light-brightness-below-minimum',
        act: set('light', 'light-brightness-below-minimum', { brightness: 0 }),
        minMs: 5_000,
    },
    {
        name: 'light-brightness-above-maximum',
        act: set('light', 'light-brightness-above-maximum', {
            brightness: 300,
        }),
        minMs: 5_000,
    },
    {
        name: 'light-color-temperature',
        act: set('light', 'light-color-temperature', { color_temp: 300 }),
        until: stateIs('light', { color_temp: 300 }),
    },
    {
        name: 'light-color-temperature-above-maximum',
        act: set('light', 'light-color-temperature-above-maximum', {
            color_temp: 500,
        }),
        minMs: 5_000,
    },
    {
        name: 'light-off',
        act: set('light', 'light-off', { state: 'OFF' }),
        until: stateIs('light', { state: 'OFF' }),
    },
    {
        name: 'rename-light',
        act: (harness) =>
            harness.recorder.publish('bridge/request/device/rename', {
                from: deviceId(harness, 'light'),
                to: 'Desk Lamp',
                transaction: 'rename-light',
            }),
        until: (messages) =>
            JSON.stringify(latest(messages, 'bridge/devices') ?? '').includes(
                'Desk Lamp'
            ),
    },
    {
        name: 'plug-goes-offline',
        act: (harness) => harness.devices.plug.kill(),
        minMs: OFFLINE_MS,
        timeoutMs: OFFLINE_MS + 60_000,
    },
    {
        name: 'plug-comes-back',
        act: (harness) => harness.devices.plug.start(),
        until: (messages, harness) =>
            latest(messages, deviceId(harness, 'plug')) !== undefined,
        timeoutMs: 180_000,
    },
    {
        name: 'health-check',
        act: (harness) =>
            harness.recorder.publish('bridge/request/health/check', {
                transaction: 'health-check',
            }),
        until: responded('health/check', 'health-check'),
    },
    {
        name: 'commission-without-code',
        act: (harness) =>
            harness.recorder.publish('bridge/request/commission', {
                transaction: 'commission-without-code',
            }),
        until: responded('commission', 'commission-without-code'),
    },
    {
        name: 'commission-cancel',
        act: async (harness) => {
            await harness.recorder.publish('bridge/request/commission', {
                code: ABSENT_DEVICE_CODE,
                transaction: 'commission-absent',
            })
            await harness.recorder.publish('bridge/request/commission/cancel', {
                transaction: 'commission-cancel',
            })
        },
        until: (messages) =>
            responded('commission', 'commission-absent')(messages) &&
            responded('commission/cancel', 'commission-cancel')(messages),
        // Let the cancelled attempt finish before the next request.
        minMs: 20_000,
    },
    {
        name: 'remove-light',
        act: (harness) =>
            harness.recorder.publish('bridge/request/device/remove', {
                id: deviceId(harness, 'light'),
                transaction: 'remove-light',
            }),
        until: (messages, harness) =>
            responded('device/remove', 'remove-light')(messages) &&
            latest(messages, deviceId(harness, 'light')) === null,
    },
]

export interface StepResult {
    step: string
    messages: StepRecord
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runScenario(
    harness: Harness,
    log: (line: string) => void
): Promise<StepResult[]> {
    const results: StepResult[] = []
    for (const step of STEPS) {
        if (!includesStep(harness.scope, step.name)) continue
        const startIndex = harness.recorder.messages.length
        const startedAt = Date.now()
        const timeoutMs = step.timeoutMs ?? 60_000
        log(`step ${step.name}`)
        await step.act(harness)
        for (;;) {
            const messages = harness.recorder.messages.slice(startIndex)
            const met = step.until ? step.until(messages, harness) : true
            const now = Date.now()
            const quiet =
                now - Math.max(harness.recorder.lastRecordedAt, startedAt) >=
                QUIET_MS
            const waited = now - startedAt >= (step.minMs ?? 0)
            if (met && quiet && waited) break
            if (now - startedAt > timeoutMs) {
                throw new Error(
                    `step ${step.name} did not finish within ${timeoutMs} ms`
                )
            }
            await sleep(100)
        }
        const messages = harness.recorder.messages.slice(startIndex)
        results.push({
            step: step.name,
            messages: normaliseStep(messages, harness.names),
        })
    }
    return results
}
