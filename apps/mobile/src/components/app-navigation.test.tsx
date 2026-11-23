import { useNavigation } from 'expo-router'
import {
    act,
    fireEvent,
    renderRouter,
    screen,
} from 'expo-router/testing-library'
import { Pressable, Text } from 'react-native'

import { ScreenHeader } from '~/components/screen-header'

// The drawer animates with Reanimated, whose Jest mock can't load under
// Reanimated 4.7. Keep the real drawer navigator; render its content and
// scene side by side without the animated container.
jest.mock('react-native-drawer-layout', () => {
    const { createContext } = require('react')
    const { View } = require('react-native')
    return {
        Drawer: ({
            children,
            renderDrawerContent,
        }: {
            children: React.ReactNode
            renderDrawerContent: () => React.ReactNode
        }) => (
            <View>
                {renderDrawerContent()}
                {children}
            </View>
        ),
        DrawerProgressContext: createContext(undefined),
        useDrawerProgress: () => ({ value: 0 }),
    }
})

// The layouts under test are the real ones; only the signed-in screens'
// content is stubbed, since it needs Clerk and a Controller.
jest.mock('~/components/home-control', () => ({
    HomeControlProvider: ({ children }: { children: React.ReactNode }) =>
        children,
}))

function stub(title: string) {
    return () => <ScreenHeader title={title} />
}

/** A tab root that can switch tabs the way a native tab bar press does. */
function tabRoot(title: string) {
    return function TabRoot() {
        const navigation = useNavigation()
        return (
            <>
                <Text>{title}</Text>
                <Pressable
                    accessibilityLabel={`Show Devices from ${title}`}
                    accessibilityRole="button"
                    onPress={() =>
                        navigation.dispatch({
                            type: 'JUMP_TO',
                            payload: { name: '(devices)' },
                        })
                    }
                />
            </>
        )
    }
}

// Mirrors src/app/(app): the same layout modules, stubbed leaf screens.
const app = {
    '(app)/_layout': require('../app/(app)/_layout'),
    '(app)/(tabs)/_layout': require('../app/(app)/(tabs)/_layout'),
    '(app)/(tabs)/(home,devices,energy)/_layout': require('../app/(app)/(tabs)/(home,devices,energy)/_layout'),
    '(app)/(tabs)/(home)/index': tabRoot('Home tab'),
    '(app)/(tabs)/(devices)/devices': tabRoot('Devices tab'),
    '(app)/(tabs)/(energy)/energy': tabRoot('Energy tab'),
    '(app)/(tabs)/(home,devices,energy)/rooms': stub('Rooms screen'),
    '(app)/(tabs)/(home,devices,energy)/account': stub('Account screen'),
    '(app)/(tabs)/(home,devices,energy)/settings': stub('Settings screen'),
}

async function openFromDrawer(label: string) {
    await act(async () => {
        fireEvent.press(
            screen.getByRole('button', { name: new RegExp(`^${label} `) })
        )
    })
}

describe('Signed-in navigation', () => {
    it.each([
        ['Rooms', 'rooms'],
        ['Settings', 'settings'],
        ['Account', 'account'],
    ])('opens %s inside the active tab, so the tab bar stays', async (label, route) => {
        await renderRouter(app, { initialUrl: '/energy' })
        expect(screen).toHaveSegments(['(app)', '(tabs)', '(energy)', 'energy'])

        await openFromDrawer(label)

        expect(screen).toHaveSegments(['(app)', '(tabs)', '(energy)', route])
        expect(screen.getByText(`${label} screen`)).toBeTruthy()
    })

    it('returns to Energy when going back from Rooms opened on Energy', async () => {
        await renderRouter(app, { initialUrl: '/energy' })
        await openFromDrawer('Rooms')

        await act(async () => {
            fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
        })

        expect(screen).toHaveSegments(['(app)', '(tabs)', '(energy)', 'energy'])
        expect(screen.getByText('Energy tab')).toBeTruthy()
    })

    it('does not stack Rooms twice when it is opened again', async () => {
        await renderRouter(app, { initialUrl: '/energy' })
        await openFromDrawer('Rooms')
        await openFromDrawer('Rooms')

        await act(async () => {
            fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
        })

        expect(screen).toHaveSegments(['(app)', '(tabs)', '(energy)', 'energy'])
    })

    it('keeps each tab its own stack when switching tabs', async () => {
        await renderRouter(app, { initialUrl: '/devices' })
        await openFromDrawer('Settings')
        expect(screen).toHaveSegments([
            '(app)',
            '(tabs)',
            '(devices)',
            'settings',
        ])

        await openFromDrawer('Home')
        expect(screen).toHaveSegments(['(app)', '(tabs)', '(home)'])

        await act(async () => {
            fireEvent.press(
                screen.getByRole('button', {
                    name: 'Show Devices from Home tab',
                })
            )
        })
        expect(screen).toHaveSegments([
            '(app)',
            '(tabs)',
            '(devices)',
            'settings',
        ])
    })

    it.each([
        ['/rooms', 'Rooms screen'],
        ['/account', 'Account screen'],
        ['/settings', 'Settings screen'],
    ])('resolves the deep link %s inside a tab', async (url, title) => {
        const rendered = await renderRouter(app, { initialUrl: url })

        expect(screen.getByText(title)).toBeTruthy()
        expect(rendered.getSegments().slice(0, 2)).toEqual(['(app)', '(tabs)'])
    })
})
