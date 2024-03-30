import {
    AWSLocations,
    CommissionAvailability,
    ConvertShopItemFromProductOptions,
    ShopItem
} from './structures'
import { prisma } from '@/lib/prisma'
import { sendbird } from '@/lib/sendbird'
import { SendbirdUserData } from '@/sendbird/sendbird-structures'
import { Artist, Product } from '@prisma/client'
import { S3GetSignedURL } from './storage'

/**
 * Joins variable amount of classnames into one string
 *
 * @param classes - css classnames
 * @returns {string} Classnames all joined together in one string
 */
export function ClassNames(...classes: any) {
    return classes.filter(Boolean).join(' ')
}

/**
 * Gets the item id from a pathname
 *
 * @param pathname - The pathname to find the item id from
 * @returns {string} Substring of the full path containing the item id
 */
export const GetItemId = (pathname: string) => {
    let lastSlash = pathname.lastIndexOf('/')
    return pathname.substring(lastSlash + 1, pathname.length + 1)
}

/**
 *
 * @param {string} availability
 * @returns
 */
export function StringToCommissionAvailability(availability: string) {
    switch (availability) {
        case 'closed':
            return CommissionAvailability.Closed
        case 'waitlist':
            return CommissionAvailability.Waitlist
        case 'open':
            return CommissionAvailability.Open
    }

    return CommissionAvailability.Closed
}

/**
 *
 * @param number
 * @returns
 */
export function FormatNumberToCurrency(number: number) {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    })

    return formatter.format(number)
}

/**
 *
 * @param form_id
 * @returns
 */
export async function UpdateCommissionAvailability(form_id: string) {
    const form = await prisma.form.findFirst({
        where: {
            id: form_id
        },
        include: {
            commission: true
        }
    })

    let new_availability: CommissionAvailability = CommissionAvailability.Open

    // Check if we have reached our max number of commissions until WAITLIST
    if (
        form?.newSubmissions! + 1 >= form?.commission?.maxCommissionsUntilWaitlist! &&
        form?.commission?.maxCommissionsUntilWaitlist != 0
    ) {
        new_availability = CommissionAvailability.Waitlist
    }

    // Check if we have reached our max number of commmissions until CLOSED
    if (
        form?.newSubmissions! + 1 >= form?.commission?.maxCommissionsUntilClosed! &&
        form?.commission?.maxCommissionsUntilClosed != 0
    ) {
        new_availability = CommissionAvailability.Closed
    }

    // If the availability hasn't changed then just return
    if (new_availability == CommissionAvailability.Open) {
        return
    }

    // Otherwise update the commission
    await prisma.commission.update({
        where: {
            id: form?.commissionId!
        },
        data: {
            availability: new_availability
        }
    })
}

/**
 *
 * @param timestamp
 * @returns
 */
export function ConvertDateToLocaleString(timestamp: Date) {
    return timestamp.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    })
}

export function AsRedisKey(
    object:
        | 'users'
        | 'portfolio_items'
        | 'stripe_accounts'
        | 'products'
        | 'products_metadata'
        | 'forms'
        | 'form_submissions'
        | 'artists'
        | 'commissions'
        | 'commissions_editable'
        | 'commissions_data'
        | 'kanbans'
        | 'invoices'
        | 'downloads',
    ...unique_identifiers: string[]
) {
    return `${object}:${unique_identifiers.join(':')}`
}
