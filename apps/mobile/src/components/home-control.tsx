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

import {
    CONFIRMATION_WINDOW_MS,
    type TrackedCommand,
    useCommandTracker,
} from '~/components/use-command-tracker'
import type { DeviceControl } from '~/lib/device-control'

const NO_CAPABILITIES: readonly CapabilityCurrentState[] = []

type HomeControlValue = {
    status: ConnectionStatus
    /** LAN or Relay reaches the Controller, so state is current. */
    live: boolean
    /** Devices or Capabilities on screen are from before the connection dropped. */
    stale: boolean
    devices: Device[] | undefined
    rooms: Room[] | undefined
    /** The Controller was reached but did not return its Rooms. */
    roomsFailed: boolean
    capabilities: readonly CapabilityCurrentState[]
    /** False while `capabilities` is a previous snapshot. */
    capabilitiesCurrent: boolean
    loadFailed: boolean
    reconnect: () => void
    commandFor: (
        deviceId: string,
        controlKey: string
    ) => TrackedCommand | undefined
    sendControl: (
        deviceId: string,
        control: DeviceControl,
        desired: boolean | number
    ) => void
    dismissCommand: (deviceId: string, controlKey: string) => void
    /** Reload Devices and Rooms, for example after a setup action. */
    refreshInventory: () => Promise<void>
    /** Outcome of a setup action whose subject left the screen. */
    notice: string | null
    showNotice: (message: string) => void
    dismissNotice: () => void
    /**
     * Setup outcomes by subject, kept here so feedback survives a Device
     * card moving to another Room section.
     */
    setupState: (key: string) => SetupState
    setSetupState: (key: string, state: SetupState) => void
}

/** Outcome of one Device or Room setup action. */
export type SetupState =
    | { phase: 'idle' }
    | { phase: 'saving' }
    | { phase: 'done'; message: string }
    | { phase: 'failed'; message: string }

const IDLE: SetupState = { phase: 'idle' }

const HomeControlContext = createContext<HomeControlValue | null>(null)

/**
 * Last-seen Home state for the Control surface, in memory for this session
 * only. Everything comes from the shared Controller provider; nothing here
 * chooses a transport or is written to disk.
 */
export function HomeControlProvider({
    children,
    confirmationWindowMs = CONFIRMATION_WINDOW_MS,
}: {
    children: ReactNode
    /** How long an accepted Command may wait for confirming Device state. */
    confirmationWindowMs?: number
}) {
    const { connection, getRooms, reprobe, sendCommand } = useController()
    const { devices, error, refresh: refreshDevices, status } = useDevices()
    const { view } = useCapabilityState()
    const [rooms, setRooms] = useState<Room[] | undefined>(undefined)
    const [roomsFailed, setRoomsFailed] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [setupStates, setSetupStates] = useState<Record<string, SetupState>>(
        {}
    )
    const setupState = useCallback(
        (key: string) => setupStates[key] ?? IDLE,
        [setupStates]
    )
    const setSetupState = useCallback((key: string, state: SetupState) => {
        setSetupStates((current) => ({ ...current, [key]: state }))
    }, [])
    const live = status.mode === 'lan' || status.mode === 'relay'

    // The Controller session clears its view on disconnect; keep the last one.
    const lastView = useRef<CapabilityView | null>(view)
    if (view) lastView.current = view
    const shownView = view ?? lastView.current

    const refreshRooms = useCallback(async () => {
        try {
            setRooms(await getRooms())
            setRoomsFailed(false)
        } catch {
            // Keep the Rooms already shown; connection status explains why.
            setRoomsFailed(true)
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

    const refreshInventory = useCallback(async () => {
        await Promise.all([refreshDevices(), refreshRooms()])
    }, [refreshDevices, refreshRooms])

    const dismissNotice = useCallback(() => setNotice(null), [])

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

    const { commandFor, send, dismiss } = useCommandTracker({
        devices,
        live,
        sendCommand,
        confirmationWindowMs,
    })

    const value = useMemo<HomeControlValue>(
        () => ({
            status,
            live,
            stale: !live && (devices !== undefined || shownView !== null),
            devices,
            rooms,
            roomsFailed,
            capabilities: shownView?.capabilities ?? NO_CAPABILITIES,
            capabilitiesCurrent: live && view !== null,
            loadFailed: live && devices === undefined && error !== null,
            reconnect,
            commandFor,
            sendControl: (deviceId, control, desired) => {
                void send(deviceId, control, desired)
            },
            dismissCommand: dismiss,
            refreshInventory,
            notice,
            showNotice: setNotice,
            dismissNotice,
            setupState,
            setSetupState,
        }),
        [
            status,
            live,
            devices,
            rooms,
            roomsFailed,
            shownView,
            view,
            error,
            reconnect,
            commandFor,
            send,
            dismiss,
            refreshInventory,
            notice,
            dismissNotice,
            setupState,
            setSetupState,
        ]
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
