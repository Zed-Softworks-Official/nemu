import { User } from '@clerk/nextjs/server'
import { InferSelectModel } from 'drizzle-orm'
import {
    NemuImageData,
    KanbanContainerData,
    KanbanTask,
    ImageEditorData
} from '~/core/structures'
import { artists, commissions, requests } from '~/server/db/schema'

/**
 * The different states a commission can be in
 *
 * Closed, Waitlist, Open
 */
export enum CommissionAvailability {
    Closed = 'closed',
    Waitlist = 'waitlist',
    Open = 'open'
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
export type ClientRequestData = InferSelectModel<typeof requests> & {
    user: User
    commission?: InferSelectModel<typeof commissions> & {
        artist?: InferSelectModel<typeof artists>
    }
}

/**
 * Client Side Commission Item, It basically contains all of same stuff as the db item
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

    // Request Data
    requests?: ClientRequestData[] 
}

export type ClientCommissionItemEditable = {
    id: string
    title: string
    description: string

    availability: CommissionAvailability
    slug: string
    published: boolean

    price: number

    max_commissions_until_waitlist: number
    max_commissions_until_closed: number

    form_id: string

    images: ImageEditorData[]
}

/**
 * The different states a request can be in
 */
export enum RequestStatus {
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Delivered = 'delivered',
    Waitlist = 'waitlist'
}

/**
 * Kanban Message Data for commissions
 */
export type KanbanSendbirdData = {
    containers: KanbanContainerData[]
    tasks: KanbanTask[]
}
