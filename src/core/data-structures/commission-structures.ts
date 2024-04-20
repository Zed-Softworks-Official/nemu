import { KanbanContainerData } from '~/core/data-structures/kanban-structures'
import { NemuImageData, OverwriteType } from '~/core/structures'
import { Commission } from '@prisma/client'

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
export interface CommissionOrders {
    user_id: string
    customer_id: string
    rush: boolean

    containers?: KanbanContainerData[]
    order_id?: string
}

/**
 * Client Side Commission Item, It basically contains all of same stuff as the prisma item
 * However, the images also includes blur data instead of just the url for the image
 */
export type ClientCommissionItem = OverwriteType<Commission, { images: NemuImageData[] }>
