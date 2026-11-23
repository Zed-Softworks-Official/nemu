import { ApiError, roomNotEmptyDetailsSchema } from '@nemu/protocol'

/**
 * The message to show when a Room action fails. A `room_not_empty` error
 * names the Devices and Components that still use the Room.
 */
export function roomActionMessage(error: unknown): string {
    if (error instanceof ApiError && error.code === 'room_not_empty') {
        const details = roomNotEmptyDetailsSchema.safeParse(error.details)
        if (details.success) {
            const names = [
                ...details.data.devices.map((device) => device.name),
                ...details.data.components.map(
                    (component) =>
                        `${component.deviceName} (${component.componentId})`
                ),
            ]
            if (names.length > 0) {
                return `Move ${joinNames(names)} to another room first.`
            }
        }
    }
    return error instanceof Error ? error.message : String(error)
}

function joinNames(names: string[]): string {
    if (names.length === 1) return names[0] ?? ''
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
