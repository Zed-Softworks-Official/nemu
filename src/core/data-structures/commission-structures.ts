import { Request, User } from '@prisma/client'
import { NemuImageData, KanbanContainerData, KanbanTask } from '~/core/structures'

/**
 * The different states a commission can be in
 *
 * Closed, Waitlist, Open
 */
export enum CommissionAvailability {
    Closed,
    Waitlist,
    Open
}

/**
 * Order Details
 *
 * @prop {string} user_id - The user id of the customer
 * @prop {string} customer_id - The stripe customer id of the user
 * @prop {boolean} rush - Is this a rush order?
 *
 * @prop {KanbanContainerData[] | undefined} - The kanban data for the user
 * @prop {string | undefined} - The order id
 */
export type CommissionOrders = {
    user_id: string
    customer_id: string
    rush: boolean

    containers?: KanbanContainerData[]
    order_id?: string
}

/**
 * Client Side Commission Request Data, It basically contains all of same stuff as the prisma request
 */
export type ClientRequestData = Request & { user: User }

/**
 * Client Side Commission Item, It basically contains all of same stuff as the prisma item
 * However, the images also includes blur data instead of just the url for the image
 */
export type ClientCommissionItem = {
    // Commission Data
    title: string
    description: string

    price: string
    raw_price?: number

    images: NemuImageData[]
    rating: number

    availability: CommissionAvailability
    slug: string
    published: boolean

    total_requests?: number
    new_requests?: number

    max_commissions_until_waitlist?: number
    max_commissions_until_closed?: number

    id?: string
    form_id?: string

    // Artist Data
    artist?: {
        handle: string
        supporter: boolean
        terms?: string
    }

    // Form Data
    form?: {
        content: string
    }

    // Review Data
    reviews?: {
        username: string
        content: string
        rating: number
    }[]
}

/**
 * The different states a request can be in
 */
export enum RequestStatus {
    Pending,
    Accepted,
    Rejected,
    Delivered
}

/**
 * Kanban Message Data for commissions
 */
export type KanbanSendbirdData = {
    containers: KanbanContainerData[]
    tasks: KanbanTask[]
}
