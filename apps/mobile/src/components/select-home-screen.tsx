import { ChevronRight } from 'lucide-react-native'
import { styled } from 'nativewind'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useHomeSession } from '~/components/home-session'
import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

const StyledSafeAreaView = styled(SafeAreaView)

export function SelectHomeScreen() {
    const { homes, selectHome } = useHomeSession()

    return (
        <View className="flex-1 bg-background">
            <StyledSafeAreaView className="flex-1 gap-6 p-8">
                <View className="gap-1.5">
                    <Text
                        accessibilityRole="header"
                        className="font-semibold text-3xl text-foreground"
                    >
                        Choose a Home
                    </Text>
                    <Text className="text-muted-foreground text-sm leading-relaxed">
                        Commands from this phone go to the Home you choose. You
                        can switch Homes later in Settings.
                    </Text>
                </View>

                {homes && homes.length === 0 ? (
                    <View className="gap-2 rounded-sm border border-border p-4">
                        <Text className="font-medium text-foreground">
                            No Homes yet
                        </Text>
                        <Text className="text-muted-foreground text-sm leading-relaxed">
                            Set up a Home or accept an invitation from the Nemu
                            dashboard while you are on the Home’s network. It
                            will appear here.
                        </Text>
                    </View>
                ) : (
                    <ScrollView contentContainerClassName="gap-3">
                        {(homes ?? []).map((home) => (
                            <Pressable
                                accessibilityHint="Uses this Home for this phone"
                                accessibilityLabel={home.name}
                                accessibilityRole="button"
                                className="flex-row items-center justify-between gap-4 rounded-sm border border-border p-4 active:bg-muted"
                                key={home.controllerId}
                                onPress={() => selectHome(home.controllerId)}
                            >
                                <Text
                                    className="min-w-0 flex-1 font-medium text-foreground text-lg"
                                    numberOfLines={1}
                                >
                                    {home.name}
                                </Text>
                                <ChevronRight
                                    color={colors.mutedForeground}
                                    size={20}
                                />
                            </Pressable>
                        ))}
                    </ScrollView>
                )}
            </StyledSafeAreaView>
        </View>
    )
}
