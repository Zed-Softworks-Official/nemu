import { useAuth } from '@clerk/expo'
import { Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useHomeSession } from '~/components/home-session'
import { colors } from '~/constants/colors'

export function AppRoute() {
    const { isLoaded, isSignedIn } = useAuth()
    const { route } = useHomeSession()

    if (!isLoaded || (isSignedIn && route === 'loading')) {
        return (
            <View className="flex-1 items-center justify-center bg-background">
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        )
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!!isSignedIn && route === 'app'}>
                <Stack.Screen name="(app)" />
            </Stack.Protected>

            <Stack.Protected guard={!!isSignedIn && route === 'select-home'}>
                <Stack.Screen name="select-home" />
            </Stack.Protected>

            <Stack.Protected guard={!!isSignedIn && route === 'pair'}>
                <Stack.Screen name="pair" />
            </Stack.Protected>

            <Stack.Protected guard={!isSignedIn}>
                <Stack.Screen name="welcome" />
            </Stack.Protected>
        </Stack>
    )
}
