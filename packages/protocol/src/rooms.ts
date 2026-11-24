import type { Device } from './device.ts'

/**
 * The Devices deleting a Room moves: every Device assigned to it, and every
 * Device with a Component explicitly assigned to it, each once.
 */
export function devicesInRoom(
    devices: readonly Device[],
    roomId: string
): Device[] {
    return devices.filter(
        (device) =>
            device.roomId === roomId ||
            Object.values(device.componentRooms ?? {}).includes(roomId)
    )
}

export function countDevices(count: number): string {
    return count === 1 ? '1 Device' : `${count} Devices`
}

/** What a delete confirmation says will happen to a Room's Devices. */
export function roomDeletionSummary(
    count: number,
    destinationName: string
): string {
    if (count === 0) return 'No Devices are in this Room.'
    return `${countDevices(count)} will move to ${destinationName}.`
}
