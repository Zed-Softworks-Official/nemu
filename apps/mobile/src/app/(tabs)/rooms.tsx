import { styled } from 'nativewind'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const StyledSafeAreaView = styled(SafeAreaView)

export default function RoomsScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="max-w-sm p-4">
                <Text className="text-foreground">Rooms</Text>
            </StyledSafeAreaView>
        </View>
    )
}
