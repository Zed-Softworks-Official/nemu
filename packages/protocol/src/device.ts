import { z } from 'zod'

export const deviceStateSchema = z.record(z.string(), z.unknown())
export type DeviceState = z.infer<typeof deviceStateSchema>

export const deviceProtocolSchema = z.enum(['zigbee', 'matter'])
export type DeviceProtocol = z.infer<typeof deviceProtocolSchema>

export const deviceSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    // Optional so clients keep working against cores that predate Matter.
    protocol: deviceProtocolSchema.optional(),
    model: z.string().optional(),
    roomId: z.string().nullable().optional(),
    online: z.boolean(),
    state: deviceStateSchema
        .nullish()
        .transform((value): DeviceState | undefined => value ?? undefined),
})
export type Device = z.infer<typeof deviceSchema>

/** Keep a usable list when one row fails validation. */
export function parseDeviceList(value: unknown): Device[] {
    if (!Array.isArray(value)) return []
    const devices: Device[] = []
    for (const item of value) {
        const parsed = deviceSchema.safeParse(item)
        if (parsed.success) devices.push(parsed.data)
    }
    return devices
}

export const roomSchema = z.object({
    id: z.string(),
    name: z.string(),
    sortOrder: z.number().optional(),
})
export type Room = z.infer<typeof roomSchema>
