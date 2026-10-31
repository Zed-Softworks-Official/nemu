import { cn } from '@nemu/ui/lib/utils'
import type { DrawerContentComponentProps } from 'expo-router/drawer'
import { DrawerContentScrollView } from 'expo-router/drawer'
import { Bolt, Home, LayoutGrid, Settings, User, X } from 'lucide-react-native'
import type { ComponentType } from 'react'
import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '~/components/ui/text'
import { colors } from '~/constants/colors'

type DrawerLink = {
    name: '(tabs)' | 'rooms' | 'settings' | 'account'
    label: string
    description: string
    icon: ComponentType<{ color: string; size: number; strokeWidth?: number }>
}

const links: DrawerLink[] = [
    {
        name: '(tabs)',
        label: 'Home',
        description: 'Overview and status',
        icon: Home,
    },
    {
        name: 'rooms',
        label: 'Rooms',
        description: 'Organize by space',
        icon: LayoutGrid,
    },
    {
        name: 'settings',
        label: 'Settings',
        description: 'Home preferences',
        icon: Settings,
    },
    {
        name: 'account',
        label: 'Account',
        description: 'Profile and security',
        icon: User,
    },
]

export function AppDrawerContent(props: DrawerContentComponentProps) {
    const insets = useSafeAreaInsets()
    const focused = props.state.routes[props.state.index]?.name

    return (
        <View className="flex-1 border-border border-l bg-background">
            <DrawerContentScrollView
                {...props}
                contentContainerStyle={{
                    paddingTop: insets.top + 8,
                    paddingBottom: insets.bottom + 16,
                    flexGrow: 1,
                }}
                style={{ backgroundColor: 'transparent' }}
            >
                <View className="flex-row items-start justify-between gap-3 border-border border-b px-5 pb-5">
                    <View className="min-w-0 flex-1 gap-1">
                        <View className="flex-row items-center gap-2">
                            <Bolt
                                color={colors.primary}
                                size={18}
                                strokeWidth={2.25}
                            />
                            <Text className="font-sans-semibold text-foreground text-lg">
                                Nemu
                            </Text>
                        </View>
                        <Text className="text-muted-foreground text-sm">
                            More views and settings
                        </Text>
                    </View>
                    <Pressable
                        accessibilityLabel="Close menu"
                        accessibilityRole="button"
                        className="size-10 items-center justify-center rounded-sm active:bg-muted"
                        hitSlop={8}
                        onPress={() =>
                            props.navigation.dispatch({ type: 'CLOSE_DRAWER' })
                        }
                    >
                        <X
                            color={colors.foreground}
                            size={20}
                            strokeWidth={2}
                        />
                    </Pressable>
                </View>

                <View className="gap-1 p-3">
                    {links.map((link) => {
                        const active = focused === link.name
                        const Icon = link.icon

                        return (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                className={cn(
                                    'flex-row items-center gap-3 rounded-sm px-3 py-3 active:bg-muted',
                                    active && 'bg-primary/10'
                                )}
                                key={link.name}
                                onPress={() => {
                                    props.navigation.navigate(link.name)
                                    props.navigation.dispatch({
                                        type: 'CLOSE_DRAWER',
                                    })
                                }}
                            >
                                <View
                                    className={cn(
                                        'size-10 items-center justify-center rounded-sm bg-secondary',
                                        active && 'bg-primary/15'
                                    )}
                                >
                                    <Icon
                                        color={
                                            active
                                                ? colors.primary
                                                : colors.mutedForeground
                                        }
                                        size={18}
                                        strokeWidth={2}
                                    />
                                </View>
                                <View className="min-w-0 flex-1 gap-0.5">
                                    <Text
                                        className={cn(
                                            'font-sans-medium text-base',
                                            active
                                                ? 'text-primary'
                                                : 'text-foreground'
                                        )}
                                    >
                                        {link.label}
                                    </Text>
                                    <Text className="text-muted-foreground text-xs">
                                        {link.description}
                                    </Text>
                                </View>
                            </Pressable>
                        )
                    })}
                </View>
            </DrawerContentScrollView>
        </View>
    )
}
