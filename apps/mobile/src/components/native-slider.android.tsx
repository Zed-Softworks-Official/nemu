import { Host, Slider } from '@expo/ui/jetpack-compose'
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers'
import { useRef } from 'react'
import { View } from 'react-native'

import type { NativeSliderProps } from '~/components/native-slider'

const CLEAR = {
    activeTrackColor: 'transparent',
    inactiveTrackColor: 'transparent',
    disabledActiveTrackColor: 'transparent',
    disabledInactiveTrackColor: 'transparent',
} as const

/** A Compose Slider. See `native-slider.tsx`. */
export function NativeSlider({
    label,
    valueText,
    value,
    min,
    max,
    disabled,
    clearTrack,
    onValueChange,
    onRelease,
}: NativeSliderProps) {
    const latest = useRef<number | null>(null)
    return (
        <View>
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                <Slider
                    colors={clearTrack ? CLEAR : undefined}
                    enabled={!disabled}
                    max={max}
                    min={min}
                    modifiers={[
                        fillMaxWidth(),
                        semantics({
                            contentDescription: `${label}, ${valueText}`,
                        }),
                    ]}
                    onValueChange={(next) => {
                        latest.current = next
                        onValueChange(next)
                    }}
                    onValueChangeFinished={() => {
                        const released = latest.current
                        latest.current = null
                        if (released !== null && !disabled) onRelease(released)
                    }}
                    value={value}
                />
            </Host>
        </View>
    )
}
