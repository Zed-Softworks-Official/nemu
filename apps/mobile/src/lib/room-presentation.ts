import { countDevices, type Room } from '@nemu/protocol'

/** Rooms in the Home's order, then by name. */
export function sortRooms(rooms: readonly Room[]): Room[] {
    return [...rooms].sort(
        (a, b) =>
            (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
                (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
            a.name.localeCompare(b.name)
    )
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
