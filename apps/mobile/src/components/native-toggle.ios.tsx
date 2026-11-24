import { Host, Toggle } from '@expo/ui/swift-ui'
import {
    accessibilityLabel,
    disabled as disabledModifier,
    labelsHidden,
} from '@expo/ui/swift-ui/modifiers'
import { useState } from 'react'
import { View } from 'react-native'

import type { NativeToggleProps } from '~/components/native-toggle'

/** A SwiftUI Toggle. See `native-toggle.tsx`. */
export function NativeToggle({
    label,
    value,
    disabled,
    onValueChange,
}: NativeToggleProps) {
    // SwiftUI flips its own state on tap. Remounting returns it to `value`,
    // which stays the reported state until the Device changes.
    const [generation, setGeneration] = useState(0)
    return (
        // Claim the touch so a tap here never also opens a surrounding card.
        <View onStartShouldSetResponder={() => true}>
            <Host key={generation} matchContents>
                <Toggle
                    isOn={value}
                    label={label}
                    modifiers={[
                        labelsHidden(),
                        accessibilityLabel(label),
                        disabledModifier(disabled),
                    ]}
                    onIsOnChange={(next) => {
                        setGeneration((current) => current + 1)
                        if (!disabled) onValueChange(next)
                    }}
                />
            </Host>
        </View>
    )
}
