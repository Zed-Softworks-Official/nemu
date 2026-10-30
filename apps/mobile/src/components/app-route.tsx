import { useAuth } from '@clerk/expo'
import { Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

export function AppRoute() {
    const { isLoaded, isSignedIn } = useAuth()

    if (!isLoaded) {
        return (
            <View className="flex-1 items-center justify-center bg-background">
                <ActivityIndicator color="#398cfa" size="large" />
            </View>
        )
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!!isSignedIn}>
                <Stack.Screen name="(tabs)" />
            </Stack.Protected>

            <Stack.Protected guard={!isSignedIn}>
                <Stack.Screen name="welcome" />
            </Stack.Protected>
        </Stack>
    )
}
