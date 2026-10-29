import '~/global.css'

import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useColorScheme } from 'react-native'
import AppTabs from '~/components/app-tabs'

import { env } from '~/env'

SplashScreen.preventAutoHideAsync()

export default function TabLayout() {
    const colorScheme = useColorScheme()
    return (
        <ClerkProvider
            publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
            tokenCache={tokenCache}
        >
            <ThemeProvider
                value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
            >
                <AppTabs />
            </ThemeProvider>
        </ClerkProvider>
    )
}
