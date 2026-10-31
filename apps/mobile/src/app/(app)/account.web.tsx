import { UserProfile } from '@clerk/expo/web'
import { styled } from 'nativewind'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ScreenHeader } from '~/components/screen-header'

const StyledSafeAreaView = styled(SafeAreaView)

export default function AccountScreen() {
    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <ScreenHeader title="Account" />
                <View className="flex-1 items-center overflow-scroll">
                    <UserProfile />
                </View>
            </StyledSafeAreaView>
        </View>
    )
}
