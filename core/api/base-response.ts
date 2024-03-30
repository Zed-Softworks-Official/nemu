import { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { AppRouter } from "../trpc/root"

/**
 * StatusCode
 * Generic http status codes used inside of nemu
 */
export enum StatusCode {
    Success = 200,
    MovedPermanently = 301,
    Redirect = 302,
    BadRequest = 400,
    Unauthorized = 401,
    PaymentRequired = 402,
    InternalError = 500,
    NotImplemented = 501
}

/**
 * Nemu Response
 * The generic response from an api route
 *
 * @prop {StatusCode} status - The status code
 * @prop {string} message - Message containing information about what occured
 */
export interface NemuResponse {
    status: StatusCode
    message?: string
}

export type RouterOutput = inferRouterOutputs<AppRouter>
export type RouterInput = inferRouterInputs<AppRouter>