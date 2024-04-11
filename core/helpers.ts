import { CommissionAvailability } from './structures'

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
        | 'stripe'
        | 'products'
        | 'products_metadata'
        | 'forms'
        | 'requests'
        | 'artists'
        | 'commissions'
        | 'commissions_editable'
        | 'commissions_data'
        | 'kanbans'
        | 'invoices'
        | 'downloads'
        | 'reviews',
    ...unique_identifiers: string[]
) {
    return `${object}:${unique_identifiers.join(':')}`
}
