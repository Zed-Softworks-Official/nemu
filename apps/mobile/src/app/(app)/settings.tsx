import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useHomeSession } from '~/components/home-session'
import { ScreenHeader } from '~/components/screen-header'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

const StyledSafeAreaView = styled(SafeAreaView)

export default function SettingsScreen() {
    const { activeHome, switchHome } = useHomeSession()

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <ScreenHeader title="Settings" />
                <View className="gap-3">
                    <Text className="text-muted-foreground text-sm">
                        Commands from this phone go to {activeHome?.name}.
                    </Text>
                    <View className="flex-row">
                        <Button
                            onPress={switchHome}
                            title="Choose a different Home"
                            variant="outline"
                        />
                    </View>
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
