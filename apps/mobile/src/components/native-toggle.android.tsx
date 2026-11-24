import { Host, Switch } from '@expo/ui/jetpack-compose'
import { semantics } from '@expo/ui/jetpack-compose/modifiers'
import { useState } from 'react'
import { View } from 'react-native'

import type { NativeToggleProps } from '~/components/native-toggle'

/** A Compose Switch. See `native-toggle.tsx`. */
export function NativeToggle({
    label,
    value,
    disabled,
    onValueChange,
}: NativeToggleProps) {
    // Remounting returns the Switch to `value`, the reported state.
    const [generation, setGeneration] = useState(0)
    return (
        // Claim the touch so a tap here never also opens a surrounding card.
        <View onStartShouldSetResponder={() => true}>
            <Host key={generation} matchContents>
                <Switch
                    enabled={!disabled}
                    modifiers={[semantics({ contentDescription: label })]}
                    onCheckedChange={(next) => {
                        setGeneration((current) => current + 1)
                        if (!disabled) onValueChange(next)
                    }}
                    value={value}
                />
            </Host>
        </View>
    )
}
