import { Switch } from 'react-native'

export type NativeToggleProps = {
    /** Spoken name of the toggle; no visible label is drawn. */
    label: string
    /** The value to show. Flipping it only asks `onValueChange`. */
    value: boolean
    disabled: boolean
    onValueChange: (value: boolean) => void
}

/**
 * An on/off control. iOS uses a SwiftUI Toggle and Android a Compose
 * Switch (the `.ios` and `.android` files); this React Native Switch is
 * the fallback for web and the stand-in under Jest.
 */
export function NativeToggle({
    label,
    value,
    disabled,
    onValueChange,
}: NativeToggleProps) {
    return (
        <Switch
            accessibilityLabel={label}
            disabled={disabled}
            onValueChange={onValueChange}
            value={value}
        />
    )
}
