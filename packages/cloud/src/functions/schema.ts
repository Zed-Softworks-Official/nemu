import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  controllers: defineTable({
    controllerId: v.string(),
    publicKey: v.string(),
    name: v.string(),
    registeredAt: v.number(),
  }).index("by_controller_id", ["controllerId"]),

  pairings: defineTable({
    userId: v.string(),
    controllerId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_controller", ["userId", "controllerId"])
    .index("by_controller", ["controllerId"]),

  relayMessages: defineTable({
    controllerId: v.string(),
    direction: v.union(v.literal("toController"), v.literal("toClient")),
    requestId: v.string(),
    payload: v.string(),
    consumed: v.boolean(),
    expiresAt: v.number(),
  })
    .index("by_controller_and_direction", [
      "controllerId",
      "direction",
      "consumed",
    ])
    .index("by_request_id", ["requestId"])
    .index("by_expiry", ["expiresAt"]),
});
