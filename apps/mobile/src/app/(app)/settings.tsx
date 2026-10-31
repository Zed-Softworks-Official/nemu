import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ScreenHeader } from '~/components/screen-header'
import { Text } from '~/components/ui/text'

const StyledSafeAreaView = styled(SafeAreaView)

export default function SettingsScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <ScreenHeader title="Settings" />
                <Text className="text-muted-foreground text-sm">
                    Home and device preferences.
                </Text>
            </StyledSafeAreaView>
        </View>
    )
}
