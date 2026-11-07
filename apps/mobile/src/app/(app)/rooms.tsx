import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { RoomsView } from '~/components/control-surface'
import { ScreenHeader } from '~/components/screen-header'

const StyledSafeAreaView = styled(SafeAreaView)

export default function RoomsScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <ScreenHeader title="Rooms" />
                <View className="min-h-0 flex-1">
                    <RoomsView />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
