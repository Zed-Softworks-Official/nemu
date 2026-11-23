import { router } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { DrawerMenuButton } from '~/components/drawer-menu-button'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

type ScreenHeaderProps = {
    title: string
    showBack?: boolean
}

export function ScreenHeader({ title, showBack = true }: ScreenHeaderProps) {
    return (
        <View className="flex-row items-center justify-between gap-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
                {showBack ? (
                    <Pressable
                        accessibilityLabel="Go back"
                        accessibilityRole="button"
                        className="-ml-2 size-10 items-center justify-center rounded-sm active:bg-muted"
                        hitSlop={8}
                        onPress={() => router.back()}
                    >
                        <ChevronLeft
                            color={colors.foreground}
                            size={24}
                            strokeWidth={2}
                        />
                    </Pressable>
                ) : null}
                <Text
                    className="min-w-0 flex-1 font-semibold text-foreground text-xl"
                    numberOfLines={1}
                >
                    {title}
                </Text>
            </View>
            <DrawerMenuButton />
        </View>
    )
}
