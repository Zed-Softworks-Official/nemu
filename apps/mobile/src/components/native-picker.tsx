import { cn } from '@nemu/ui/lib/utils'
import { Pressable, View } from 'react-native'

import { Text } from '~/components/ui/text'

export type NativePickerOption = {
    value: string
    label: string
}

export type NativePickerProps = {
    /** Visible and spoken name of the picker. */
    label: string
    options: readonly NativePickerOption[]
    /** The value to show. Choosing another only asks `onChange`. */
    selected: string
    disabled: boolean
    onChange: (value: string) => void
}

/**
 * Chooses one of several options. iOS uses a SwiftUI menu Picker and Android
 * a Compose exposed dropdown menu (the `.ios` and `.android` files); this
 * list of buttons is the fallback for web and the stand-in under Jest.
 */
export function NativePicker({
    label,
    options,
    selected,
    disabled,
    onChange,
}: NativePickerProps) {
    return (
        <View accessibilityLabel={label} className="gap-2">
            <Text className="text-muted-foreground text-sm">{label}</Text>
            <View className="flex-row flex-wrap gap-2">
                {options.map((option) => {
                    const isSelected = option.value === selected
                    return (
                        <Pressable
                            accessibilityLabel={option.label}
                            accessibilityRole="button"
                            accessibilityState={{
                                selected: isSelected,
                                disabled,
                            }}
                            className={cn(
                                'h-9 justify-center rounded-sm border px-3',
                                isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border',
                                disabled && 'opacity-50'
                            )}
                            disabled={disabled}
                            key={option.value}
                            onPress={() => onChange(option.value)}
                        >
                            <Text className="text-foreground text-sm">
                                {option.label}
                            </Text>
                        </Pressable>
                    )
                })}
            </View>
        </View>
    )
}
