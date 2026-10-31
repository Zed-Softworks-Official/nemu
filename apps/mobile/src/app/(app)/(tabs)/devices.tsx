import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { DrawerMenuButton } from '~/components/drawer-menu-button'
import { Text } from '~/components/ui/text'

const StyledSafeAreaView = styled(SafeAreaView)

export default function DevicesScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <View className="flex-row items-center justify-between gap-4">
                    <Text className="min-w-0 flex-1 font-semibold text-foreground text-xl">
                        Devices
                    </Text>
                    <DrawerMenuButton />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
