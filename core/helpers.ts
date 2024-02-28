import { request } from 'graphql-request'
import { CommissionAvailability } from './structures'
import { prisma } from '@/lib/prisma'

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
 * General Fetcher for use with SWR library
 *
 * @param args - Takes in a variable amount of parameters from the fetch function
 * @returns JSON data for the requested data
 */
export const Fetcher = (...args: Parameters<typeof fetch>) => fetch(...args).then((res) => res.json())

/**
 *
 * @param query
 * @returns
 */
// export const GraphQLFetcher = (query: string) => request('/api/graphql', query)

export function GraphQLFetcher<T>(query: string) {
    return request<T>(`/api/graphql`, query)
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
    if (form?.newSubmissions! + 1 >= form?.commission?.maxCommissionsUntilWaitlist! && form?.commission?.maxCommissionsUntilWaitlist != 0) {
        new_availability = CommissionAvailability.Waitlist
    }

    // Check if we have reached our max number of commmissions until CLOSED
    if (form?.newSubmissions! + 1 >= form?.commission?.maxCommissionsUntilClosed! && form?.commission?.maxCommissionsUntilClosed != 0) {
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
