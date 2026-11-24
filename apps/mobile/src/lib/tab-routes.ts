/**
 * Every signed-in screen lives on one tab's Stack (see
 * `(tabs)/(home,devices,energy)`). Pushing a screen or a sheet onto the
 * active tab keeps the native tab bar under it.
 */
export type Tab = '(home)' | '(devices)' | '(energy)'

const TABS: readonly string[] = ['(home)', '(devices)', '(energy)']

export function activeTab(segments: readonly string[]): Tab {
    const tab = segments.find((segment) => TABS.includes(segment))
    return (tab as Tab | undefined) ?? '(home)'
}

/** The Device sheet for one Device, on the active tab's Stack. */
export function deviceSheetHref(segments: readonly string[], deviceId: string) {
    return {
        pathname: `/(app)/(tabs)/${activeTab(segments)}/device/[deviceId]`,
        params: { deviceId },
    } as const
}

/** The Room sheet for one Room, on the active tab's Stack. */
export function roomSheetHref(segments: readonly string[], roomId: string) {
    return {
        pathname: `/(app)/(tabs)/${activeTab(segments)}/room/[roomId]`,
        params: { roomId },
    } as const
}

/** The create-Room sheet, on the active tab's Stack. */
export function createRoomSheetHref(segments: readonly string[]) {
    return `/(app)/(tabs)/${activeTab(segments)}/room/new` as const
}

/** The add-Device sheet, on the active tab's Stack. */
export function addDeviceHref(segments: readonly string[]) {
    return `/(app)/(tabs)/${activeTab(segments)}/add-device` as const
}
