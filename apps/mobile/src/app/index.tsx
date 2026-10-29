import { useUser } from '@clerk/expo'
import { useHostedAuth } from '@clerk/expo/hosted-auth'
import { ActivityIndicator, Button, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '~/components/themed-text'
import { ThemedView } from '~/components/themed-view'
import { BottomTabInset, MaxContentWidth, Spacing } from '~/constants/theme'

export default function HomeScreen() {
    const { isLoaded, isSignedIn, user } = useUser()
    const { startHostedAuth } = useHostedAuth()

    const handleSignUp = async () => {
        try {
            await startHostedAuth({ mode: 'sign-up' })
        } catch (error) {
            console.error(error)
        }
    }

    if (!isLoaded) {
        return (
            <ThemedView style={styles.container}>
                <ActivityIndicator size={'large'} />
            </ThemedView>
        )
    }

    return (
        <ThemedView style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <ThemedView style={styles.heroSection}>
                    {isSignedIn ? (
                        <ThemedText style={styles.title} type="title">
                            Welcome back, {user?.firstName}
                        </ThemedText>
                    ) : (
                        <Button onPress={handleSignUp} title="Sign Up" />
                    )}
                </ThemedView>
            </SafeAreaView>
        </ThemedView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        flexDirection: 'row',
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: Spacing.four,
        alignItems: 'center',
        gap: Spacing.three,
        paddingBottom: BottomTabInset + Spacing.three,
        maxWidth: MaxContentWidth,
    },
    heroSection: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        paddingHorizontal: Spacing.four,
        gap: Spacing.four,
    },
    title: {
        textAlign: 'center',
    },
    code: {
        textTransform: 'uppercase',
    },
    stepContainer: {
        gap: Spacing.three,
        alignSelf: 'stretch',
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.four,
        borderRadius: Spacing.four,
    },
})
