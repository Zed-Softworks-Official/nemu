import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui'
import {
    accessibilityLabel,
    disabled as disabledModifier,
    labelsHidden,
    pickerStyle,
    tag,
} from '@expo/ui/swift-ui/modifiers'
import { useState } from 'react'
import { View } from 'react-native'

import type { NativePickerProps } from '~/components/native-picker'
import { Text } from '~/components/ui/text'

/** A SwiftUI menu Picker. See `native-picker.tsx`. */
export function NativePicker({
    label,
    options,
    selected,
    disabled,
    onChange,
}: NativePickerProps) {
    // SwiftUI moves its own selection on tap. Remounting returns it to
    // `selected`, which stays the value the caller holds.
    const [generation, setGeneration] = useState(0)
    return (
        <View className="min-h-11 flex-row items-center justify-between gap-3">
            <Text className="text-muted-foreground text-sm">{label}</Text>
            <Host key={generation} matchContents>
                <Picker
                    label={label}
                    modifiers={[
                        pickerStyle('menu'),
                        labelsHidden(),
                        accessibilityLabel(label),
                        disabledModifier(disabled),
                    ]}
                    onSelectionChange={(next: string) => {
                        setGeneration((current) => current + 1)
                        if (!disabled && next !== selected) onChange(next)
                    }}
                    selection={selected}
                >
                    {options.map((option) => (
                        <SwiftText
                            key={option.value}
                            modifiers={[tag(option.value)]}
                        >
                            {option.label}
                        </SwiftText>
                    ))}
                </Picker>
            </Host>
        </View>
    )
}
