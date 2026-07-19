import { z } from "zod";
import { deviceStateSchema } from "./device";

const relayCommandMessageSchema = z.object({
  type: z.literal("command"),
  deviceId: z.string(),
  payload: deviceStateSchema,
});

const relayCommandResultMessageSchema = z.object({
  type: z.literal("commandResult"),
  ok: z.boolean(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

const relaySnapshotMessageSchema = z.object({
  type: z.literal("snapshot"),
  devices: z.array(z.unknown()),
});

export const relayToControllerEnvelopeSchema = z.object({
  requestId: z.string(),
  clientToken: z.string(),
  message: z.union([
    relayCommandMessageSchema,
    z.object({ type: z.literal("getDevices") }),
  ]),
});
export type RelayToControllerEnvelope = z.infer<
  typeof relayToControllerEnvelopeSchema
>;

export const relayToClientEnvelopeSchema = z.object({
  requestId: z.string(),
  signature: z.string(),
  message: z.union([
    relayCommandResultMessageSchema,
    relaySnapshotMessageSchema,
    z.object({
      type: z.literal("devices"),
      devices: z.array(z.unknown()),
    }),
  ]),
});
export type RelayToClientEnvelope = z.infer<typeof relayToClientEnvelopeSchema>;

export const relayEnvelopeSchema = z.union([
  relayToControllerEnvelopeSchema,
  relayToClientEnvelopeSchema,
]);
export type RelayEnvelope = z.infer<typeof relayEnvelopeSchema>;
