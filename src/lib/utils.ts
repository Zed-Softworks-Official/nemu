import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { CommissionAvailability } from '~/core/structures'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Formats a number to be in "Price Format", currently only for US
 *
 * @param {number} number - The number you wish to convert
 * @returns {string} - A string with the correct format for pricing
 */
export function format_to_currency(number: number) {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    })

    return formatter.format(number)
}

/**
 * Gets tuple data for displaying the availability
 *
 * @param {CommissionAvailability} availability - The availabilty you want the data for
 */
export function get_availability_badge_data(
    availability: CommissionAvailability
): [variant: 'default' | 'secondary' | 'destructive', text: string] {
    switch (availability) {
        case CommissionAvailability.Open:
            return ['default', 'Open']
        case CommissionAvailability.Waitlist:
            return ['secondary', 'Waitlist']
        case CommissionAvailability.Closed:
            return ['destructive', 'Closed']
    }
}
