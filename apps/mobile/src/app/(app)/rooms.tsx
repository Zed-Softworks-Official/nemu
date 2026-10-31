import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ScreenHeader } from '~/components/screen-header'
import { Text } from '~/components/ui/text'

const StyledSafeAreaView = styled(SafeAreaView)

export default function RoomsScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <ScreenHeader title="Rooms" />
                <Text className="text-muted-foreground text-sm">
                    Organize devices by room.
                </Text>
            </StyledSafeAreaView>
        </View>
    )
}
