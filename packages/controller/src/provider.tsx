'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import type { ConvexReactClient } from 'convex/react'
import {
    type ConnectionStatus,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type CommandResult,
    statusFromMode,
} from '@nemu/protocol'
import { ControllerConnection } from './connection'
import type { RelayApi } from './transports/relay'

type ControllerContextValue = {
    connection: ControllerConnection
    status: ConnectionStatus
    reprobe: () => Promise<void>
    getDevices: () => Promise<Device[]>
    sendCommand: (cmd: DeviceCommand) => Promise<CommandResult>
}

const ControllerContext = createContext<ControllerContextValue | null>(null)

export type ControllerProviderProps = {
    children: ReactNode
    convex?: ConvexReactClient
    relayApi?: RelayApi
    lanCandidates?: string[]
    controllerId?: string | null
    /** Auto-start connection manager (default true). */
    autoStart?: boolean
}

export function ControllerProvider({
    children,
    convex,
    relayApi,
    lanCandidates,
    controllerId,
    autoStart = true,
}: ControllerProviderProps) {
    const connection = useMemo(
        () =>
            new ControllerConnection({
                convex,
                relayApi,
                lanCandidates,
                controllerId,
            }),
        [convex, relayApi, lanCandidates, controllerId]
    )

    const [status, setStatus] = useState<ConnectionStatus>(
        statusFromMode('probing')
    )

    useEffect(() => {
        const unsub = connection.subscribeStatus(setStatus)
        if (autoStart) {
            void connection.start()
        }
        return () => {
            unsub()
            connection.stop()
        }
    }, [connection, autoStart])

    const reprobe = useCallback(() => connection.reprobe(), [connection])
    const getDevices = useCallback(() => connection.getDevices(), [connection])
    const sendCommand = useCallback(
        (cmd: DeviceCommand) => connection.sendCommand(cmd),
        [connection]
    )

    const value = useMemo(
        () => ({
            connection,
            status,
            reprobe,
            getDevices,
            sendCommand,
        }),
        [connection, status, reprobe, getDevices, sendCommand]
    )

    return (
        <ControllerContext.Provider value={value}>
            {children}
        </ControllerContext.Provider>
    )
}

export function useController(): ControllerContextValue {
    const ctx = useContext(ControllerContext)
    if (!ctx) {
        throw new Error('useController must be used within a ControllerProvider')
    }
    return ctx
}

export function useDevices(): {
    devices: Device[] | undefined
    error: Error | null
    refresh: () => Promise<void>
    status: ConnectionStatus
} {
    const { connection, status, getDevices } = useController()
    const [devices, setDevices] = useState<Device[] | undefined>(undefined)
    const [error, setError] = useState<Error | null>(null)

    const refresh = useCallback(async () => {
        try {
            const next = await getDevices()
            setDevices(next)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)))
        }
    }, [getDevices])

    useEffect(() => {
        if (status.mode === 'lan' || status.mode === 'relay') {
            void refresh()
        }
    }, [status.mode, refresh])

    useEffect(() => {
        return connection.subscribeEvents((event: DeviceEvent) => {
            if (
                event.type === 'resync' ||
                event.type === 'deviceJoined' ||
                event.type === 'deviceLeft' ||
                event.type === 'deviceState'
            ) {
                void refresh()
            }
        })
    }, [connection, refresh])

    return { devices, error, refresh, status }
}
