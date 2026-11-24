import { styled } from 'nativewind'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { HealthSettings } from '~/components/health-settings'
import { HomeAccessSettings } from '~/components/home-access-settings'
import { useHomeSession } from '~/components/home-session'
import { MembershipRoleProvider } from '~/components/membership-role'
import { ReleaseSettings } from '~/components/release-settings'
import { ScreenHeader } from '~/components/screen-header'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

const StyledSafeAreaView = styled(SafeAreaView)

export default function SettingsScreen() {
    const { activeHome, switchHome } = useHomeSession()

    // One role read for every Owner-only part of Settings.
    return (
        <MembershipRoleProvider>
            <View className="flex-1 bg-background">
                <StyledSafeAreaView className="flex-1">
                    <ScrollView contentContainerClassName="gap-6 p-8">
                        <ScreenHeader title="Settings" />
                        <View className="gap-3">
                            <Text className="text-muted-foreground text-sm">
                                Commands from this phone go to{' '}
                                {activeHome?.name}.
                            </Text>
                            <View className="flex-row">
                                <Button
                                    onPress={switchHome}
                                    title="Choose a different Home"
                                    variant="outline"
                                />
                            </View>
                        </View>
                        <ReleaseSettings />
                        <HealthSettings />
                        <HomeAccessSettings />
                    </ScrollView>
                </StyledSafeAreaView>
            </View>
        </MembershipRoleProvider>
    )
}
