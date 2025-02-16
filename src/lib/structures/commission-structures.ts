import type { InferSelectModel } from 'drizzle-orm'
import type {
    KanbanContainerData,
    ImageEditorData,
    ClientNemuImageData,
    ChargeMethod,
    InvoiceStatus
} from '~/lib/structures'

import type {
    artists,
    commissions,
    delivery,
    forms,
    invoices,
    kanbans,
    requests
} from '~/server/db/schema'

/**
 * The different states a commission can be in
 *
 * Closed, Waitlist, Open
 */
export const commissionAvalabilities = ['closed', 'waitlist', 'open'] as const
export type CommissionAvailability = (typeof commissionAvalabilities)[number]

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
    user: {
        id: string
        username: string
    }
    commission?: Omit<InferSelectModel<typeof commissions>, 'images'> & {
        artist?: InferSelectModel<typeof artists>
        images: ClientNemuImageData[]
    }
    delivery?: InferSelectModel<typeof delivery>
    invoices?: InferSelectModel<typeof invoices>[]
    current_invoice_index?: number
    kanban?: InferSelectModel<typeof kanbans>
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

    images: ClientNemuImageData[]
    rating: number

    availability: CommissionAvailability
    slug: string
    published: boolean

    total_requests?: number
    new_requests?: number

    max_commissions_until_waitlist?: number
    max_commissions_until_closed?: number

    charge_method: ChargeMethod
    downpayment_percentage: number

    id?: string
    form_id?: string

    // Artist Data
    artist?: {
        handle: string
        supporter: boolean
        terms?: string
    }

    // Form Data
    form?: InferSelectModel<typeof forms>

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

    price: string

    max_commissions_until_waitlist: number
    max_commissions_until_closed: number

    form_name: string

    charge_method: ChargeMethod
    downpayment_percentage: number

    images: ImageEditorData[]
}

/**
 * The different states a request can be in
 */
export const requestStatuses = [
    'pending',
    'accepted',
    'rejected',
    'delivered',
    'waitlist',
    'cancelled'
] as const
export type RequestStatus = (typeof requestStatuses)[number]

/**
 * The different types of downloads a request can have
 */
export const downloadTypes = ['image', 'archive'] as const
export type DownloadType = (typeof downloadTypes)[number]

/**
 * The request queue for a commission
 *
 * @prop {string[]} requests - The order ids of the requests that are pending or accepted
 * @prop {string[]} waitlist - The order ids of the requests that are on the waitlist
 */
export interface RequestQueue {
    requests: string[]
    waitlist: string[]
}

export interface StripeInvoiceData {
    id: string
    db_id: string
    customer_id: string
    stripe_account: string
    due_date: number
    status: InvoiceStatus
    request_id: string
    user_id: string
    order_id: string
    commission_id: string
}
