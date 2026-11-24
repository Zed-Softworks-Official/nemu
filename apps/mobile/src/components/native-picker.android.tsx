import {
    Text as ComposeText,
    DropdownMenuItem,
    ExposedDropdownMenu,
    ExposedDropdownMenuBox,
    Host,
    TextField,
    useNativeState,
} from '@expo/ui/jetpack-compose'
import {
    fillMaxWidth,
    menuAnchor,
    semantics,
} from '@expo/ui/jetpack-compose/modifiers'
import { useEffect, useState } from 'react'
import { View } from 'react-native'

import type { NativePickerProps } from '~/components/native-picker'
import { Text } from '~/components/ui/text'

/** A Compose exposed dropdown menu. See `native-picker.tsx`. */
export function NativePicker({
    label,
    options,
    selected,
    disabled,
    onChange,
}: NativePickerProps) {
    const [expanded, setExpanded] = useState(false)
    const open = expanded && !disabled
    const selectedLabel =
        options.find((option) => option.value === selected)?.label ?? ''
    // The field reads native state, which only takes its first value from
    // here; later ones are pushed.
    const field = useNativeState(selectedLabel)
    useEffect(() => {
        field.set(selectedLabel)
    }, [field, selectedLabel])
    // Losing the Controller closes the menu for good, not until it is back.
    useEffect(() => {
        if (disabled) setExpanded(false)
    }, [disabled])

    return (
        <View className="gap-2">
            <Text className="text-muted-foreground text-sm">{label}</Text>
            <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
                <ExposedDropdownMenuBox
                    expanded={open}
                    modifiers={[fillMaxWidth()]}
                    onExpandedChange={disabled ? undefined : setExpanded}
                >
                    <TextField
                        enabled={!disabled}
                        modifiers={[
                            menuAnchor('primaryNotEditable', !disabled),
                            fillMaxWidth(),
                            semantics({ contentDescription: label }),
                        ]}
                        readOnly
                        value={field}
                    />
                    <ExposedDropdownMenu
                        expanded={open}
                        onDismissRequest={() => setExpanded(false)}
                    >
                        {options.map((option) => (
                            <DropdownMenuItem
                                key={option.value}
                                onClick={() => {
                                    setExpanded(false)
                                    if (!disabled && option.value !== selected)
                                        onChange(option.value)
                                }}
                            >
                                <DropdownMenuItem.Text>
                                    <ComposeText>{option.label}</ComposeText>
                                </DropdownMenuItem.Text>
                            </DropdownMenuItem>
                        ))}
                    </ExposedDropdownMenu>
                </ExposedDropdownMenuBox>
            </Host>
        </View>
    )
}
