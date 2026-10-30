import { useHostedAuth } from '@clerk/expo/hosted-auth'
import nemuLogo from '@nemu/assets/logos/logo-dark.png'
import { Image } from 'expo-image'
import { styled } from 'nativewind'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '~/components/ui/button'

const StyledSafeAreaView = styled(SafeAreaView)
const StyledImage = styled(Image)

export default function Welcome() {
    const { startHostedAuth } = useHostedAuth()

    const handleAuth = async (mode: 'sign-in' | 'sign-up') => {
        try {
            await startHostedAuth({ mode })
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 items-center justify-center gap-56 px-4">
                <View className="w-full max-w-sm items-start px-4">
                    <StyledImage
                        className="-mb-8 size-48"
                        contentFit="contain"
                        source={nemuLogo}
                    />
                    <Text className="text-left text-4xl text-foreground">
                        Control Everything.
                    </Text>
                    <Text className="text-left text-4xl text-primary">
                        Share Nothing.
                    </Text>
                </View>
                <View className="w-full max-w-sm flex-col gap-4 px-4">
                    <Button
                        onPress={() => handleAuth('sign-in')}
                        title="Sign In"
                    />
                    <Button
                        onPress={() => handleAuth('sign-up')}
                        title="Sign Up"
                        variant="secondary"
                    />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
