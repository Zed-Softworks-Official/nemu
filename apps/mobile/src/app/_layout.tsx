import '~/global.css'

import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import {
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    useFonts,
} from '@expo-google-fonts/manrope'
import { DarkTheme, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { AppRoute } from '~/components/app-route'
import { env } from '~/env'
import { applyManropeDefaults } from '~/lib/manrope'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
    const [fontsLoaded, fontError] = useFonts({
        Manrope_400Regular,
        Manrope_500Medium,
        Manrope_600SemiBold,
        Manrope_700Bold,
    })

    useEffect(() => {
        if (fontsLoaded) {
            applyManropeDefaults()
        }
        if (fontsLoaded || fontError) {
            void SplashScreen.hideAsync()
        }
    }, [fontsLoaded, fontError])

    // Keep splash up until fonts are ready so the first paint is Manrope.
    if (!fontsLoaded && !fontError) {
        return null
    }

    return (
        <ClerkProvider
            publishableKey={env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY}
            tokenCache={tokenCache}
        >
            <ThemeProvider value={DarkTheme}>
                <AppRoute />
            </ThemeProvider>
        </ClerkProvider>
    )
}
