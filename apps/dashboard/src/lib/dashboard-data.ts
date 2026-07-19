import type { Device, Room } from '@nemu/protocol'

export type DashboardDevice = Device & {
    category: 'light' | 'climate' | 'sensor' | 'outlet'
    manufacturer: string
    lastSeen: string
    summary: string
    enabled: boolean
    level?: number
    battery?: number
}

export type DashboardRoom = Room & {
    description: string
}

export const rooms = [
    {
        id: 'living-room',
        name: 'Living room',
        description: '4 devices · 2 active',
        sortOrder: 1,
    },
    {
        id: 'kitchen',
        name: 'Kitchen',
        description: '3 devices · 1 active',
        sortOrder: 2,
    },
    {
        id: 'bedroom',
        name: 'Bedroom',
        description: '2 devices · All quiet',
        sortOrder: 3,
    },
] satisfies DashboardRoom[]

export const devices = [
    {
        id: 'floor-lamp',
        name: 'Floor lamp',
        type: 'Dimmable light',
        model: 'LWA017',
        roomId: 'living-room',
        online: true,
        category: 'light',
        manufacturer: 'Philips Hue',
        lastSeen: 'Just now',
        summary: 'Warm white · 68%',
        enabled: true,
        level: 68,
    },
    {
        id: 'reading-light',
        name: 'Reading light',
        type: 'Color light',
        model: 'LED2005R5',
        roomId: 'living-room',
        online: true,
        category: 'light',
        manufacturer: 'IKEA',
        lastSeen: 'Just now',
        summary: 'Soft white · 42%',
        enabled: true,
        level: 42,
    },
    {
        id: 'living-room-temperature',
        name: 'Temperature',
        type: 'Climate sensor',
        model: 'WSDCGQ11LM',
        roomId: 'living-room',
        online: true,
        category: 'climate',
        manufacturer: 'Aqara',
        lastSeen: '1 min ago',
        summary: '22.4° · 46% humidity',
        enabled: true,
        battery: 87,
    },
    {
        id: 'tv-outlet',
        name: 'TV outlet',
        type: 'Smart outlet',
        model: 'S31 Lite',
        roomId: 'living-room',
        online: false,
        category: 'outlet',
        manufacturer: 'Sonoff',
        lastSeen: '18 min ago',
        summary: 'Unavailable',
        enabled: false,
    },
    {
        id: 'counter-lights',
        name: 'Counter lights',
        type: 'Dimmable light',
        model: 'LWB010',
        roomId: 'kitchen',
        online: true,
        category: 'light',
        manufacturer: 'Philips Hue',
        lastSeen: 'Just now',
        summary: 'Bright white · 80%',
        enabled: true,
        level: 80,
    },
    {
        id: 'coffee-outlet',
        name: 'Coffee outlet',
        type: 'Smart outlet',
        model: 'SP 120',
        roomId: 'kitchen',
        online: true,
        category: 'outlet',
        manufacturer: 'Innr',
        lastSeen: '3 min ago',
        summary: 'Off · 0 W',
        enabled: false,
    },
    {
        id: 'kitchen-motion',
        name: 'Motion sensor',
        type: 'Motion sensor',
        model: 'RTCGQ11LM',
        roomId: 'kitchen',
        online: true,
        category: 'sensor',
        manufacturer: 'Aqara',
        lastSeen: '2 min ago',
        summary: 'No motion',
        enabled: true,
        battery: 64,
    },
    {
        id: 'bedside-lamp',
        name: 'Bedside lamp',
        type: 'Dimmable light',
        model: 'E12-N1',
        roomId: 'bedroom',
        online: true,
        category: 'light',
        manufacturer: 'Sengled',
        lastSeen: '4 min ago',
        summary: 'Off · 25%',
        enabled: false,
        level: 25,
    },
    {
        id: 'bedroom-temperature',
        name: 'Temperature',
        type: 'Climate sensor',
        model: 'SNZB-02D',
        roomId: 'bedroom',
        online: true,
        category: 'climate',
        manufacturer: 'Sonoff',
        lastSeen: '2 min ago',
        summary: '20.8° · 43% humidity',
        enabled: true,
        battery: 91,
    },
] satisfies DashboardDevice[]

export function getRoom(roomId: string | null | undefined) {
    return rooms.find((room) => room.id === roomId)
}

export function getDevice(deviceId: string) {
    return devices.find((device) => device.id === deviceId)
}
