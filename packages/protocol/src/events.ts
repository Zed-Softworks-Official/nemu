import { z } from "zod";
import { deviceSchema, deviceStateSchema } from "./device";

export const deviceEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("deviceState"),
    deviceId: z.string(),
    state: deviceStateSchema,
  }),
  z.object({
    type: z.literal("deviceJoined"),
    device: deviceSchema,
  }),
  z.object({
    type: z.literal("deviceLeft"),
    deviceId: z.string(),
  }),
  z.object({
    type: z.literal("interview"),
    ieeeAddress: z.string(),
    status: z.enum(["started", "successful", "failed"]),
  }),
  z.object({
    type: z.literal("resync"),
  }),
  z.object({
    type: z.literal("health"),
    mqtt: z.boolean(),
    zigbee: z.boolean(),
    db: z.boolean(),
  }),
  z.object({
    type: z.literal("commandResult"),
    requestId: z.string(),
    ok: z.boolean(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  }),
]);
export type DeviceEvent = z.infer<typeof deviceEventSchema>;

export const clientWsMessageSchema = z.object({
  type: z.literal("command"),
  requestId: z.string(),
  deviceId: z.string(),
  payload: deviceStateSchema,
});
export type ClientWsMessage = z.infer<typeof clientWsMessageSchema>;
