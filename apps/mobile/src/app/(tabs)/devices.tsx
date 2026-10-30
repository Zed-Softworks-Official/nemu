import { styled } from 'nativewind'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const StyledSafeAreaView = styled(SafeAreaView)

export default function DevicesScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="max-w-sm p-4">
                <Text className="text-foreground">Devices</Text>
            </StyledSafeAreaView>
        </View>
    )
}
