import type { Device, Room } from '@nemu/protocol'

/** Rooms in the Home's order, then by name. */
export function sortRooms(rooms: readonly Room[]): Room[] {
    return [...rooms].sort(
        (a, b) =>
            (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
                (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name)
    )
}

/**
 * The Devices deleting a Room moves: every Device assigned to it, and every
 * Device with a Component explicitly assigned to it, each once. The
 * dashboard counts the same way (its `devicesInRoom`).
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

function countDevices(count: number): string {
    return count === 1 ? '1 Device' : `${count} Devices`
}

/** What the delete confirmation says will happen to a Room's Devices. */
export function roomDeletionSummary(
    count: number,
    destinationName: string
): string {
    if (count === 0) return 'No Devices are in this Room.'
    return `${countDevices(count)} will move to ${destinationName}.`
}

/** What is shown once a Room was deleted. */
export function roomDeletedNotice(
    roomName: string,
    count: number,
    destinationName: string
): string {
    if (count === 0) return `Deleted ${roomName}.`
    return `Deleted ${roomName}. ${countDevices(count)} moved to ${destinationName}.`
}
