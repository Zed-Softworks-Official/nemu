import { v } from "convex/values";
import { authedMutation, authedQuery } from "../lib/customFunctions";

const pairingValidator = v.object({
  _id: v.id("pairings"),
  _creationTime: v.number(),
  userId: v.string(),
  controllerId: v.string(),
  createdAt: v.number(),
});

export const list = authedQuery({
  args: {},
  returns: v.array(pairingValidator),
  handler: async (ctx) => {
    return await ctx.db
      .query("pairings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.identity.subject))
      .collect();
  },
});

export const create = authedMutation({
  args: {
    controllerId: v.string(),
  },
  returns: v.id("pairings"),
  handler: async (ctx, args) => {
    const controller = await ctx.db
      .query("controllers")
      .withIndex("by_controller_id", (q) =>
        q.eq("controllerId", args.controllerId),
      )
      .unique();
    if (!controller) {
      throw new Error("Controller not found");
    }

    const existing = await ctx.db
      .query("pairings")
      .withIndex("by_user_and_controller", (q) =>
        q
          .eq("userId", ctx.identity.subject)
          .eq("controllerId", args.controllerId),
      )
      .unique();
    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("pairings", {
      userId: ctx.identity.subject,
      controllerId: args.controllerId,
      createdAt: Date.now(),
    });
  },
});

export const remove = authedMutation({
  args: {
    controllerId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pairings")
      .withIndex("by_user_and_controller", (q) =>
        q
          .eq("userId", ctx.identity.subject)
          .eq("controllerId", args.controllerId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
