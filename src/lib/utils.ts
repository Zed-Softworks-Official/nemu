import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import type {
    CommissionAvailability,
    ClientNemuImageData,
    NemuImageData
} from '~/lib/structures'
import { env } from '~/env'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function format_file_size(size: number) {
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`
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
        case 'open':
            return ['default', 'Open']
        case 'waitlist':
            return ['secondary', 'Waitlist']
        case 'closed':
            return ['destructive', 'Closed']
    }
}

export function calculate_percentage_change(current: number, previous: number) {
    if (current === previous && current === 0 && previous === 0) {
        return '0%'
    }

    return (
        new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero' }).format(
            (current - previous) / current
        ) + '%'
    )
}

/**
 * Converts a list of images to a list of NemuImageData
 *
 * @param {string[]} images - The images to convert
 * @returns {NemuImageData[]} - The converted images
 */
export async function convert_images_to_nemu_images(images: NemuImageData[]) {
    // Format for client
    const result: ClientNemuImageData[] = []

    for (const image of images) {
        result.push({
            url: get_ut_url(image.ut_key)
        })
    }

    return result
}

export const to_pusher_key = (key: string) => key.replace(/:/g, '__')

export function get_ut_url(ut_key: string) {
    return `https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${ut_key}`
}
