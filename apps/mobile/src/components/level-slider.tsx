import { useEffect, useState } from 'react'
import { View } from 'react-native'

import { NativeSlider } from '~/components/native-slider'
import { Text } from '~/components/ui/text'
import type { DeviceControl } from '~/lib/device-control'

const WARM_TO_COOL = 'linear-gradient(90deg, #ff9329, #fff1e0, #bcd4ff)'

/**
 * A native slider for a level. The thumb follows the finger without sending
 * anything; letting go calls `onRelease` once with the chosen value.
 */
export function LevelSlider({
    control,
    value,
    enabled,
    name,
    onRelease,
}: {
    control: Extract<DeviceControl, { kind: 'level' }>
    /** Shown unless a drag is in progress. */
    value: number
    enabled: boolean
    name: string
    onRelease: (value: number) => void
}) {
    const [dragged, setDragged] = useState<number | null>(null)

    // A drag cut short, say by the Controller dropping, is not a choice.
    useEffect(() => {
        if (!enabled) setDragged(null)
    }, [enabled])

    const shown = enabled && dragged !== null ? control.snap(dragged) : value
    const position = enabled && dragged !== null ? dragged : value
    const gradient = control.track === 'warmToCool'

    return (
        <View className="gap-1">
            <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-foreground text-sm">
                    {control.label}
                </Text>
                <Text className="text-foreground text-sm">
                    {control.format(shown)}
                </Text>
            </View>
            <View className="justify-center">
                {gradient ? (
                    <View
                        className="absolute inset-x-0 h-1.5 rounded-full"
                        style={{
                            experimental_backgroundImage: WARM_TO_COOL,
                            opacity: enabled ? 1 : 0.5,
                        }}
                        testID="warm-to-cool-track"
                    />
                ) : null}
                <NativeSlider
                    clearTrack={gradient}
                    disabled={!enabled}
                    label={name}
                    max={control.max}
                    min={control.min}
                    onRelease={(released) => {
                        setDragged(null)
                        onRelease(control.snap(released))
                    }}
                    onValueChange={setDragged}
                    value={Math.min(
                        control.max,
                        Math.max(control.min, position)
                    )}
                    valueText={control.format(shown)}
                />
            </View>
        </View>
    )
}
