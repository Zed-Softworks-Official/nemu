import { Stack } from 'expo-router'
import type { ComponentProps } from 'react'

import { colors } from '~/constants/colors'

/**
 * Each tab (Home, Devices, Energy) gets its own Stack from this one layout.
 * Rooms, Account and Settings live here once and are pushed onto the
 * active tab's Stack, so the native tab bar stays visible under them.
 *
 * Sheet routes (Device, Room, create Room, add Device, update confirmation)
 * belong in this Stack as `Stack.Screen`s with
 * `presentation: 'formSheet'` and `sheetAllowedDetents`: they open above
 * the tab bar and hand it back when dismissed.
 */
// Each tab's root stays under a deep-linked screen, so back returns to it.
export const unstable_settings = {
    home: { anchor: 'index' },
    devices: { anchor: 'devices' },
    energy: { anchor: 'energy' },
}

/**
 * How every sheet route is presented: a form sheet with detents on iOS, a
 * bottom sheet on Android. Sheets cover the tab bar only while open.
 */
const sheetOptions: ComponentProps<typeof Stack.Screen>['options'] = {
    presentation: 'formSheet',
    sheetAllowedDetents: [0.6, 1],
    sheetGrabberVisible: true,
    sheetCornerRadius: 16,
    contentStyle: { backgroundColor: colors.background },
}

export default function TabStackLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
            }}
        >
            <Stack.Screen name="add-device" options={sheetOptions} />
            <Stack.Screen name="device/[deviceId]" options={sheetOptions} />
        </Stack>
    )
}
