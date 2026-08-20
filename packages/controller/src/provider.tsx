'use client'

import {
    type BootstrapOwnerRequest,
    type ClientToken,
    type CommandResult,
    type CommissionRequest,
    type CommissionResponse,
    type ConnectionStatus,
    type CreateRoomRequest,
    type Device,
    type DeviceCommand,
    type DeviceEvent,
    type DeviceProtocol,
    type HouseholdMember,
    type PatchDeviceRequest,
    type PatchRoomRequest,
    type PermitJoinResponse,
    type Room,
    statusFromMode,
} from '@nemu/protocol'
import type { ConvexReactClient } from 'convex/react'
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
import { ControllerConnection } from './connection'
import type { RelayApi } from './transports/relay'

type ControllerContextValue = {
    connection: ControllerConnection
    status: ConnectionStatus
    reprobe: () => Promise<void>
    getDevices: () => Promise<Device[]>
    sendCommand: (cmd: DeviceCommand) => Promise<CommandResult>
    permitJoin: (seconds: number) => Promise<PermitJoinResponse>
    commissionMatter: (
        request: CommissionRequest
    ) => Promise<CommissionResponse>
    getRooms: () => Promise<Room[]>
    createRoom: (request: CreateRoomRequest) => Promise<Room>
    patchRoom: (roomId: string, patch: PatchRoomRequest) => Promise<Room>
    deleteRoom: (roomId: string) => Promise<void>
    patchDevice: (
        deviceId: string,
        patch: PatchDeviceRequest
    ) => Promise<Device>
    forgetDevice: (deviceId: string) => Promise<void>
    getMembers: () => Promise<HouseholdMember[]>
    inviteMember: (email: string) => Promise<HouseholdMember>
    removeMember: (memberId: string) => Promise<void>
    getTokens: () => Promise<ClientToken[]>
    revokeToken: (tokenId: string) => Promise<void>
    revokeCurrentToken: () => Promise<void>
    bootstrapOwner: (request: BootstrapOwnerRequest) => Promise<HouseholdMember>
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
    const permitJoin = useCallback(
        (seconds: number) => connection.permitJoin(seconds),
        [connection]
    )
    const commissionMatter = useCallback(
        (request: CommissionRequest) => connection.commissionMatter(request),
        [connection]
    )
    const getRooms = useCallback(() => connection.getRooms(), [connection])
    const createRoom = useCallback(
        (request: CreateRoomRequest) => connection.createRoom(request),
        [connection]
    )
    const patchRoom = useCallback(
        (roomId: string, patch: PatchRoomRequest) =>
            connection.patchRoom(roomId, patch),
        [connection]
    )
    const deleteRoom = useCallback(
        (roomId: string) => connection.deleteRoom(roomId),
        [connection]
    )
    const patchDevice = useCallback(
        (deviceId: string, patch: PatchDeviceRequest) =>
            connection.patchDevice(deviceId, patch),
        [connection]
    )
    const forgetDevice = useCallback(
        (deviceId: string) => connection.forgetDevice(deviceId),
        [connection]
    )
    const getMembers = useCallback(() => connection.getMembers(), [connection])
    const inviteMember = useCallback(
        (email: string) => connection.inviteMember(email),
        [connection]
    )
    const removeMember = useCallback(
        (memberId: string) => connection.removeMember(memberId),
        [connection]
    )
    const getTokens = useCallback(() => connection.getTokens(), [connection])
    const revokeToken = useCallback(
        (tokenId: string) => connection.revokeToken(tokenId),
        [connection]
    )
    const revokeCurrentToken = useCallback(
        () => connection.revokeCurrentToken(),
        [connection]
    )
    const bootstrapOwner = useCallback(
        (request: BootstrapOwnerRequest) => connection.bootstrapOwner(request),
        [connection]
    )

    const value = useMemo(
        () => ({
            connection,
            status,
            reprobe,
            getDevices,
            sendCommand,
            permitJoin,
            commissionMatter,
            getRooms,
            createRoom,
            patchRoom,
            deleteRoom,
            patchDevice,
            forgetDevice,
            getMembers,
            inviteMember,
            removeMember,
            getTokens,
            revokeToken,
            revokeCurrentToken,
            bootstrapOwner,
        }),
        [
            connection,
            status,
            reprobe,
            getDevices,
            sendCommand,
            permitJoin,
            commissionMatter,
            getRooms,
            createRoom,
            patchRoom,
            deleteRoom,
            patchDevice,
            forgetDevice,
            getMembers,
            inviteMember,
            removeMember,
            getTokens,
            revokeToken,
            revokeCurrentToken,
            bootstrapOwner,
        ]
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
        throw new Error(
            'useController must be used within a ControllerProvider'
        )
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

export type DevicePairingPhase =
    | 'idle'
    | 'discovering'
    | 'configuring'
    | 'saving'
    | 'success'
    | 'error'

export type PairingInterview = {
    externalId: string
    status: 'started' | 'successful' | 'failed'
}

export function useDevicePairing(): {
    phase: DevicePairingPhase
    status: ConnectionStatus
    protocol: DeviceProtocol
    interviews: PairingInterview[]
    discoveredDevices: Device[]
    selectedDevice: Device | null
    rooms: Room[]
    roomsLoading: boolean
    roomsError: Error | null
    error: Error | null
    secondsRemaining: number
    startDiscovery: () => Promise<void>
    startMatterCommission: (request: CommissionRequest) => Promise<void>
    selectDevice: (device: Device) => Promise<void>
    configureDevice: (input: PatchDeviceRequest) => Promise<Device>
    reset: () => void
} {
    const {
        connection,
        status,
        permitJoin,
        commissionMatter,
        getDevices,
        getRooms,
        patchDevice,
    } = useController()
    const [protocol, setProtocol] = useState<DeviceProtocol>('zigbee')
    const [phase, setPhase] = useState<DevicePairingPhase>('idle')
    const [interviews, setInterviews] = useState<PairingInterview[]>([])
    const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([])
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
    const [rooms, setRooms] = useState<Room[]>([])
    const [roomsLoading, setRoomsLoading] = useState(false)
    const [roomsError, setRoomsError] = useState<Error | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const [expiresAt, setExpiresAt] = useState<number | null>(null)
    const [secondsRemaining, setSecondsRemaining] = useState(0)
    const knownDeviceIds = useRef(new Set<string>())

    const absorbMatterJoins = useCallback(async () => {
        const devices = await getDevices()
        const known = knownDeviceIds.current
        const joined = devices.filter(
            (device) => device.protocol === 'matter' && !known.has(device.id)
        )
        if (joined.length === 0) return
        setDiscoveredDevices((current) => {
            const seen = new Set(current.map((device) => device.id))
            const next = [...current]
            for (const device of joined) {
                if (!seen.has(device.id)) next.push(device)
            }
            return next
        })
    }, [getDevices])

    useEffect(() => {
        if (phase !== 'discovering') return

        return connection.subscribeEvents((event: DeviceEvent) => {
            if (event.type === 'interview') {
                setInterviews((current) => {
                    const next = current.filter(
                        (item) => item.externalId !== event.externalId
                    )
                    return [
                        ...next,
                        {
                            externalId: event.externalId,
                            status: event.status,
                        },
                    ]
                })
            }

            if (event.type === 'deviceJoined') {
                setDiscoveredDevices((current) => {
                    const next = current.filter(
                        (device) => device.id !== event.device.id
                    )
                    return [...next, event.device]
                })
            }

            if (event.type === 'resync' && protocol === 'matter') {
                void absorbMatterJoins()
            }
        })
    }, [absorbMatterJoins, connection, phase, protocol])

    useEffect(() => {
        if (phase !== 'discovering' || expiresAt === null) return

        const updateCountdown = () => {
            const remaining = Math.max(
                0,
                Math.ceil((expiresAt - Date.now()) / 1000)
            )
            setSecondsRemaining(remaining)
            if (remaining === 0 && discoveredDevices.length === 0) {
                setError(
                    new Error(
                        protocol === 'matter'
                            ? 'The device did not finish joining. If its light is solid, factory-reset it and pair again on the same 2.4 GHz Wi-Fi as this machine.'
                            : 'The pairing window expired'
                    )
                )
                setPhase('error')
            }
        }

        updateCountdown()
        const timer = setInterval(updateCountdown, 1000)
        return () => clearInterval(timer)
    }, [phase, expiresAt, discoveredDevices.length, protocol])

    const reset = useCallback(() => {
        setProtocol('zigbee')
        setPhase('idle')
        setInterviews([])
        setDiscoveredDevices([])
        setSelectedDevice(null)
        setRooms([])
        setRoomsLoading(false)
        setRoomsError(null)
        setError(null)
        setExpiresAt(null)
        setSecondsRemaining(0)
        knownDeviceIds.current = new Set()
    }, [])

    const startDiscovery = useCallback(async () => {
        setProtocol('zigbee')
        setError(null)
        setInterviews([])
        setDiscoveredDevices([])
        setSelectedDevice(null)
        setPhase('discovering')

        try {
            const result = await permitJoin(180)
            setExpiresAt(Date.now() + result.seconds * 1000)
            setSecondsRemaining(result.seconds)
        } catch (err) {
            setError(toError(err))
            setPhase('error')
        }
    }, [permitJoin])

    const startMatterCommission = useCallback(
        async (request: CommissionRequest) => {
            try {
                const existing = await getDevices()
                knownDeviceIds.current = new Set(
                    existing.map((device) => device.id)
                )
            } catch {
                knownDeviceIds.current = new Set()
            }

            setProtocol('matter')
            setError(null)
            setInterviews([])
            setDiscoveredDevices([])
            setSelectedDevice(null)
            setPhase('discovering')
            // BLE + Wi-Fi join can take a minute; LAN rediscovery hangs
            // forever if mDNS never sees the node.
            setExpiresAt(Date.now() + 120_000)
            setSecondsRemaining(120)

            try {
                await commissionMatter(request)
                await absorbMatterJoins()
            } catch (err) {
                setError(toError(err))
                setPhase('error')
            }
        },
        [absorbMatterJoins, commissionMatter, getDevices]
    )

    const selectDevice = useCallback(
        async (device: Device) => {
            setSelectedDevice(device)
            setPhase('configuring')
            setRoomsLoading(true)
            setRoomsError(null)

            try {
                setRooms(await getRooms())
            } catch (err) {
                setRoomsError(toError(err))
            } finally {
                setRoomsLoading(false)
            }
        },
        [getRooms]
    )

    const configureDevice = useCallback(
        async (input: PatchDeviceRequest) => {
            if (!selectedDevice) {
                throw new Error('Select a device before configuring it')
            }

            setError(null)
            setPhase('saving')
            try {
                const updated = await patchDevice(selectedDevice.id, input)
                setSelectedDevice(updated)
                setPhase('success')
                return updated
            } catch (err) {
                const nextError = toError(err)
                setError(nextError)
                setPhase('configuring')
                throw nextError
            }
        },
        [patchDevice, selectedDevice]
    )

    return {
        phase,
        status,
        protocol,
        interviews,
        discoveredDevices,
        selectedDevice,
        rooms,
        roomsLoading,
        roomsError,
        error,
        secondsRemaining,
        startDiscovery,
        startMatterCommission,
        selectDevice,
        configureDevice,
        reset,
    }
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value))
}
