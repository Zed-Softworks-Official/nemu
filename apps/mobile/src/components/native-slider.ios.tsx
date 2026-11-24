import { Host, Slider } from '@expo/ui/swift-ui'
import {
    accessibilityLabel,
    accessibilityValue,
    disabled as disabledModifier,
    tint,
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useRef } from 'react'
import { View } from 'react-native'

import type { NativeSliderProps } from '~/components/native-slider'

/** SwiftUI may report the last value just after it reports the release. */
const SETTLE_MS = 50

/** A SwiftUI Slider. See `native-slider.tsx`. */
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
    const editing = useRef(false)
    const settling = useRef<ReturnType<typeof setTimeout> | null>(null)
    const release = useRef(() => {})
    release.current = () => {
        settling.current = null
        const released = latest.current
        latest.current = null
        if (released !== null && !disabled) onRelease(released)
    }

    function cancelSettling() {
        if (settling.current) clearTimeout(settling.current)
        settling.current = null
    }
    useEffect(
        () => () => {
            // Closing the sheet right after letting go keeps the choice.
            if (settling.current) {
                clearTimeout(settling.current)
                release.current()
            }
        },
        []
    )

    return (
        <View>
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                <Slider
                    max={max}
                    min={min}
                    modifiers={[
                        accessibilityLabel(label),
                        accessibilityValue(valueText),
                        disabledModifier(disabled),
                        ...(clearTrack ? [tint('transparent')] : []),
                    ]}
                    onEditingChanged={(isEditing) => {
                        cancelSettling()
                        editing.current = isEditing
                        if (!isEditing) {
                            settling.current = setTimeout(
                                () => release.current(),
                                SETTLE_MS
                            )
                        }
                    }}
                    onValueChange={(next) => {
                        // Only a person's drag counts, never an update to
                        // `value` that SwiftUI reports back.
                        if (!editing.current && !settling.current) return
                        latest.current = next
                        onValueChange(next)
                    }}
                    value={value}
                />
            </Host>
        </View>
    )
}
