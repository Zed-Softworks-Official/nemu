/** The Matter Commands that carry out a `{id}/set` request. */
import {
    CLUSTER_ON_OFF,
    COMMAND_OFF,
    COMMAND_ON,
    COMMAND_TOGGLE,
} from './clusters.ts'
import type { EndpointDevice } from './node.ts'

/** One cluster command, sent to each target endpoint. */
export interface DeviceCommand {
    cluster: number
    command: number
    fields?: Record<string, unknown>
}

export interface SetCommands {
    actions: DeviceCommand[]
    /** Keys of the request that are not a setting this Device takes. */
    ignored: string[]
}

/** Keys that ride along with a set without being a setting. */
const PASSIVE_KEYS = new Set(['transaction', 'outlet', 'transition'])
// TODO(NEM-116): brightness, color_temp and color become Commands here.
const SETTING_KEYS = new Set(['state'])

export function commandsForSet(payload: Record<string, unknown>): SetCommands {
    const actions: DeviceCommand[] = []
    const ignored: string[] = []
    if ('state' in payload) {
        const command = onOffCommand(payload.state)
        if (command === undefined) ignored.push('state')
        else actions.push({ cluster: CLUSTER_ON_OFF, command })
    }
    for (const key of Object.keys(payload)) {
        if (!SETTING_KEYS.has(key) && !PASSIVE_KEYS.has(key)) ignored.push(key)
    }
    return { actions, ignored }
}

function onOffCommand(raw: unknown): number | undefined {
    const value =
        typeof raw === 'boolean'
            ? raw
                ? 'ON'
                : 'OFF'
            : typeof raw === 'string'
              ? raw.trim().toUpperCase()
              : ''
    if (value === 'ON') return COMMAND_ON
    if (value === 'OFF') return COMMAND_OFF
    if (value === 'TOGGLE') return COMMAND_TOGGLE
    return undefined
}

/** The endpoints a set goes to. */
export function targetEndpoints(
    device: EndpointDevice,
    _payload: Record<string, unknown>
): number[] {
    // TODO(NEM-117): a strip targets the outlet the payload names, else all outlets.
    return [device.endpoint]
}
