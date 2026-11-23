import { NativeTabs } from 'expo-router/native-tabs'

export default function TabsLayout() {
    return (
        <NativeTabs>
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

            <NativeTabs.Trigger name="energy">
                <NativeTabs.Trigger.Label>Energy</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon
                    md="energy"
                    renderingMode="template"
                    sf="bolt.fill"
                />
            </NativeTabs.Trigger>
        </NativeTabs>
    )
}
