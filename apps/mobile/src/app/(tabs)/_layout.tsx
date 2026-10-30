import { NativeTabs } from 'expo-router/native-tabs'
import { useColorScheme } from 'react-native'

import { Colors } from '~/constants/theme'

export default function TabsLayout() {
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'dark' ? 'dark' : 'light']

    return (
        <NativeTabs
            backgroundColor={colors.background}
            indicatorColor={colors.backgroundElement}
            labelStyle={{ selected: { color: colors.text } }}
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    md="home"
                    renderingMode="template"
                    sf="house.fill"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="devices">
                <NativeTabs.Trigger.Label>Devices</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    md="devices"
                    renderingMode="template"
                    sf="laptopcomputer.and.iphone"
                />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="rooms">
                <NativeTabs.Trigger.Label>Rooms</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    md="room"
                    renderingMode="template"
                    sf="door.left.hand.open"
                />
            </NativeTabs.Trigger>
        </NativeTabs>
    )
}
