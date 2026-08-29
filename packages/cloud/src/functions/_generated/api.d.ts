/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acmeActions from "../acmeActions.js";
import type * as controllerJwtActions from "../controllerJwtActions.js";
import type * as controllers from "../controllers.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as pairings from "../pairings.js";
import type * as relay from "../relay.js";
import type * as sessionMints from "../sessionMints.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acmeActions: typeof acmeActions;
  controllerJwtActions: typeof controllerJwtActions;
  controllers: typeof controllers;
  crons: typeof crons;
  http: typeof http;
  invites: typeof invites;
  pairings: typeof pairings;
  relay: typeof relay;
  sessionMints: typeof sessionMints;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
