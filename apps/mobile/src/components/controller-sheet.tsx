import { createContext, type ReactNode, useContext } from 'react'
import { ScrollView, View } from 'react-native'

import { useHomeControl } from '~/components/home-control'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

type ControllerSheetValue = {
    /** LAN or Relay reaches the Controller, so the sheet may change things. */
    reachable: boolean
}

const ControllerSheetContext = createContext<ControllerSheetValue | null>(null)

/**
 * The frame for every sheet that controls or changes something on the
 * Controller: the Device, Room, add-Device and update-confirmation sheets.
 *
 * When the Controller becomes unreachable the sheet stays open with the
 * same layout, shows `SheetUnreachableBanner`, and tells its controls
 * through `useControllerSheet()` to disable themselves. Nothing is queued:
 * controls in a sheet disable themselves and their actions refuse to run
 * while `reachable` is false (setup actions through `useSetupAction`,
 * Commands through the Command tracker), so nothing is sent later.
 */
export function ControllerSheet({
    title,
    detail,
    onClose,
    children,
}: {
    title: string
    /** One line under the title, for example the Device's availability. */
    detail?: string
    onClose: () => void
    children: ReactNode
}) {
    const { live } = useHomeControl()
    return (
        <ControllerSheetContext.Provider value={{ reachable: live }}>
            <ScrollView
                contentContainerClassName="gap-6 p-6 pb-10"
                keyboardShouldPersistTaps="handled"
            >
                <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-1">
                        <Text
                            accessibilityRole="header"
                            className="font-semibold text-foreground text-xl"
                        >
                            {title}
                        </Text>
                        {detail ? (
                            <Text className="text-muted-foreground text-sm">
                                {detail}
                            </Text>
                        ) : null}
                    </View>
                    <Button onPress={onClose} title="Done" variant="ghost" />
                </View>
                {live ? null : <SheetUnreachableBanner />}
                {children}
            </ScrollView>
        </ControllerSheetContext.Provider>
    )
}

/**
 * Whether a control inside a `ControllerSheet` may act. Outside a sheet it
 * follows the connection the same way.
 */
export function useControllerSheet(): ControllerSheetValue {
    const sheet = useContext(ControllerSheetContext)
    const { live } = useHomeControl()
    return sheet ?? { reachable: live }
}

/** One titled group of controls or edits inside a sheet. */
export function SheetSection({
    title,
    children,
}: {
    title: string
    children: ReactNode
}) {
    return (
        <View accessibilityLabel={title} className="gap-4">
            <Text
                accessibilityRole="header"
                className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]"
            >
                {title}
            </Text>
            {children}
        </View>
    )
}

/** Says the sheet shows old values and that nothing will be sent later. */
export function SheetUnreachableBanner() {
    const { reconnect } = useHomeControl()
    return (
        <View
            accessibilityRole="alert"
            className="gap-3 rounded-sm border border-warning/40 bg-warning/10 p-4"
        >
            <View className="gap-1">
                <Text className="font-medium text-foreground">
                    Showing the last known state
                </Text>
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    The Controller can’t be reached, so these values may be out
                    of date and changes are off until it’s back. Nothing is
                    saved to send later.
                </Text>
            </View>
            <View className="flex-row">
                <Button
                    onPress={reconnect}
                    title="Try again"
                    variant="outline"
                />
            </View>
        </View>
    )
}
