import { useUser } from '@clerk/expo'
import { styled } from 'nativewind'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const StyledSafeAreaView = styled(SafeAreaView)

export default function HomeScreen() {
    const { user } = useUser()

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="max-w-sm p-4">
                <Text className="text-foreground">
                    Hello, {user?.firstName}
                </Text>
            </StyledSafeAreaView>
        </View>
    )
}
