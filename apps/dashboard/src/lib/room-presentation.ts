import type { Device } from '@nemu/protocol'

/**
 * How many Devices deleting a Room moves: every Device assigned to it, and
 * every Device with a Component explicitly assigned to it, each counted once.
 */
export function devicesInRoom(devices: Device[], roomId: string): number {
    return devices.filter(
        (device) =>
            device.roomId === roomId ||
            Object.values(device.componentRooms ?? {}).includes(roomId)
    ).length
}

/** What the delete confirmation says will happen to a Room's Devices. */
export function roomDeletionSummary(
    deviceCount: number,
    destinationName: string
): string {
    if (deviceCount === 0) return 'No Devices are in this room.'
    const devices = deviceCount === 1 ? '1 Device' : `${deviceCount} Devices`
    return `${devices} will move to ${destinationName}.`
}
