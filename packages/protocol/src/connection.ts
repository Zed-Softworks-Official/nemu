import { z } from 'zod'

export const connectionModeSchema = z.enum(['lan', 'relay', 'offline', 'probing'])
export type ConnectionMode = z.infer<typeof connectionModeSchema>

export const connectionStatusSchema = z.object({
    mode: connectionModeSchema,
    label: z.enum(['Home', 'Remote', 'Offline', 'Connecting']),
    baseUrl: z.string().nullable().optional(),
    controllerId: z.string().nullable().optional(),
})
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>

export function statusFromMode(mode: ConnectionMode): ConnectionStatus {
    switch (mode) {
        case 'lan':
            return { mode, label: 'Home' }
        case 'relay':
            return { mode, label: 'Remote' }
        case 'probing':
            return { mode, label: 'Connecting' }
        default:
            return { mode: 'offline', label: 'Offline' }
    }
}
