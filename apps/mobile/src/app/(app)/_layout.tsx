import { Drawer } from 'expo-router/drawer'

import { AppDrawerContent } from '~/components/app-drawer-content'

export default function AppDrawerLayout() {
    return (
        <Drawer
            drawerContent={(props) => <AppDrawerContent {...props} />}
            screenOptions={{
                drawerPosition: 'right',
                headerShown: false,
                drawerType: 'front',
                drawerStyle: {
                    width: 304,
                    backgroundColor: 'transparent',
                },
                sceneStyle: {
                    backgroundColor: 'transparent',
                },
                overlayColor: 'rgba(0, 0, 0, 0.45)',
            }}
        >
            <Drawer.Screen
                name="(tabs)"
                options={{
                    drawerLabel: 'Home',
                }}
            />
            <Drawer.Screen
                name="rooms"
                options={{
                    drawerLabel: 'Rooms',
                }}
            />
            <Drawer.Screen
                name="settings"
                options={{
                    drawerLabel: 'Settings',
                }}
            />
            <Drawer.Screen
                name="account"
                options={{
                    drawerLabel: 'Account',
                }}
            />
        </Drawer>
    )
}
