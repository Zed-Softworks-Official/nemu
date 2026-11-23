import { styled } from 'nativewind'
import { useMemo } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { RoomsView } from '~/components/control-surface'
import { DrawerMenuButton } from '~/components/drawer-menu-button'
import { useHomeSession } from '~/components/home-session'
import { Text } from '~/components/ui/text'
import { getGreeting, getToday } from '~/lib/greeting'

const StyledSafeAreaView = styled(SafeAreaView)

export default function HomeScreen() {
    const { activeHome } = useHomeSession()
    const greeting = useMemo(() => getGreeting(), [])
    const today = useMemo(() => getToday(), [])

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <View className="flex-row items-start justify-between gap-4">
                    <View className="min-w-0 flex-1 gap-1.5">
                        <Text className="font-medium text-md text-primary uppercase tracking-[0.18em]">
                            {today}
                        </Text>
                        <Text className="font-semibold text-4xl text-foreground">
                            {greeting}
                        </Text>
                        <Text className="text-muted-foreground text-sm leading-relaxed">
                            {activeHome?.name}
                        </Text>
                    </View>
                    <DrawerMenuButton />
                </View>
                <View className="min-h-0 flex-1">
                    <RoomsView />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
