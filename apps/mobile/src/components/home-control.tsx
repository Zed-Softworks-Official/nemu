import type { CapabilityView } from '@nemu/controller'
import { useCapabilityState, useController, useDevices } from '@nemu/controller'
import type {
    CapabilityCurrentState,
    ConnectionStatus,
    Device,
    Room,
} from '@nemu/protocol'
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { AppState } from 'react-native'

const NO_CAPABILITIES: readonly CapabilityCurrentState[] = []

type HomeControlValue = {
    status: ConnectionStatus
    /** LAN or Relay reaches the Controller, so state is current. */
    live: boolean
    /** Devices or Capabilities on screen are from before the connection dropped. */
    stale: boolean
    devices: Device[] | undefined
    rooms: Room[] | undefined
    capabilities: readonly CapabilityCurrentState[]
    /** False while `capabilities` is a previous snapshot. */
    capabilitiesCurrent: boolean
    loadFailed: boolean
    reconnect: () => void
}

const HomeControlContext = createContext<HomeControlValue | null>(null)

/**
 * Last-seen Home state for the Control surface, in memory for this session
 * only. Everything comes from the shared Controller provider; nothing here
 * chooses a transport or is written to disk.
 */
export function HomeControlProvider({ children }: { children: ReactNode }) {
    const { connection, getRooms, reprobe } = useController()
    const { devices, error, status } = useDevices()
    const { view } = useCapabilityState()
    const [rooms, setRooms] = useState<Room[] | undefined>(undefined)
    const live = status.mode === 'lan' || status.mode === 'relay'

    // The Controller session clears its view on disconnect; keep the last one.
    const lastView = useRef<CapabilityView | null>(view)
    if (view) lastView.current = view
    const shownView = view ?? lastView.current

    const refreshRooms = useCallback(async () => {
        try {
            setRooms(await getRooms())
        } catch {
            // Keep the Rooms already shown; connection status explains why.
        }
    }, [getRooms])

    useEffect(() => {
        if (live) void refreshRooms()
    }, [live, refreshRooms])

    useEffect(
        () =>
            connection.subscribeEvents((event) => {
                if (event.type === 'resync') void refreshRooms()
            }),
        [connection, refreshRooms]
    )

    const reconnect = useCallback(() => {
        void reprobe()
    }, [reprobe])

    // The Controller's retry loop only looks for LAN. Coming back to the app
    // is when a person expects Relay to be tried again too.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (next) => {
            if (
                next === 'active' &&
                connection.getStatus().mode === 'offline'
            ) {
                void reprobe()
            }
        })
        return () => subscription.remove()
    }, [connection, reprobe])

    const value = useMemo<HomeControlValue>(
        () => ({
            status,
            live,
            stale: !live && (devices !== undefined || shownView !== null),
            devices,
            rooms,
            capabilities: shownView?.capabilities ?? NO_CAPABILITIES,
            capabilitiesCurrent: live && view !== null,
            loadFailed: live && devices === undefined && error !== null,
            reconnect,
        }),
        [status, live, devices, rooms, shownView, view, error, reconnect]
    )

    return (
        <HomeControlContext.Provider value={value}>
            {children}
        </HomeControlContext.Provider>
    )
}

export function useHomeControl(): HomeControlValue {
    const value = useContext(HomeControlContext)
    if (!value) {
        throw new Error(
            'useHomeControl must be used within HomeControlProvider'
        )
    }
    return value
}
