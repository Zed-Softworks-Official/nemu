import { useNavigation } from 'expo-router'
import { Menu } from 'lucide-react-native'
import { Pressable } from 'react-native'

import { colors } from '~/constants/colors'

export function DrawerMenuButton() {
    const navigation = useNavigation()

    return (
        <Pressable
            accessibilityLabel="Open menu"
            accessibilityRole="button"
            className="size-10 items-center justify-center rounded-sm active:bg-muted"
            hitSlop={8}
            onPress={() => navigation.dispatch({ type: 'OPEN_DRAWER' })}
        >
            <Menu color={colors.foreground} size={22} strokeWidth={2} />
        </Pressable>
    )
}
