import type { InferSelectModel } from 'drizzle-orm'
import type {
    KanbanContainerData,
    ImageEditorData,
    ClientNemuImageData,
    ChargeMethod,
    InvoiceStatus
} from '~/lib/types'

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
 * @prop {string} userId - The user id of the customer
 * @prop {string} customerId - The stripe customer id of the user
 * @prop {boolean} rush - Is this a rush order?
 *
 * @prop {KanbanContainerData[] | undefined} - The kanban data for the user
 * @prop {string | undefined} - The order id
 */
export type CommissionOrders = {
    userId: string
    customerId: string
    rush: boolean

    containers?: KanbanContainerData[]
    orderId?: string
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
    currentInvoiceIndex?: number
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
    rawPrice?: number

    images: ClientNemuImageData[]
    rating: number

    availability: CommissionAvailability
    slug: string
    published: boolean

    totalRequests?: number
    newRequests?: number

    maxCommissionsUntilWaitlist?: number
    maxCommissionsUntilClosed?: number

    chargeMethod: ChargeMethod
    downpaymentPercentage: number

    id?: string
    formId?: string

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

    maxCommissionsUntilWaitlist: number
    maxCommissionsUntilClosed: number

    formName: string

    chargeMethod: ChargeMethod
    downpaymentPercentage: number

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
    dbId: string
    customerId: string
    stripeAccount: string
    dueDate: number
    status: InvoiceStatus
    requestId: string
    userId: string
    orderId: string
    commissionId: string
}
