import { styled } from 'nativewind'
import { useMemo } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { DrawerMenuButton } from '~/components/drawer-menu-button'
import { Text } from '~/components/ui/text'
import { getGreeting, getToday } from '~/lib/greeting'

const StyledSafeAreaView = styled(SafeAreaView)

export default function HomeScreen() {
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
                            Locally controlled smart home devices
                        </Text>
                    </View>
                    <DrawerMenuButton />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
