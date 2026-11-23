import { Drawer } from 'expo-router/drawer'

import { AppDrawerContent } from '~/components/app-drawer-content'
import { HomeControlProvider } from '~/components/home-control'

/**
 * The drawer holds only the tabs. Rooms, Account and Settings are pushed
 * onto the active tab's Stack (see `(tabs)/(home,devices,energy)`), so the
 * native tab bar stays visible on every signed-in screen.
 */
export default function AppDrawerLayout() {
    return (
        <HomeControlProvider>
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
                <Drawer.Screen name="(tabs)" />
            </Drawer>
        </HomeControlProvider>
    )
}
