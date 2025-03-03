import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import type {
    CommissionAvailability,
    ClientNemuImageData,
    NemuImageData
} from '~/lib/types'
import { env } from '~/env'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatFileSize(size: number) {
    if (size <= 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.floor(Math.log(size) / Math.log(1024))

    const unitIndex = Math.min(index, units.length - 1)
    if (unitIndex === 0) return `${size} ${units[unitIndex]}`

    return `${(size / Math.pow(1024, unitIndex)).toFixed(1)} ${units[unitIndex]}`
}

/**
 * Formats a number to be in "Price Format", currently only for US
 *
 * @param {number} number - The number you wish to convert
 * @returns {string} - A string with the correct format for pricing
 */
export function formatToCurrency(number: number) {
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
export function getAvailabilityBadgeData(
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

export function calculatePercentageChange(current: number, previous: number) {
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
export async function convertImagesToNemuImages(images: NemuImageData[]) {
    // Format for client
    const result: ClientNemuImageData[] = []

    for (const image of images) {
        result.push({
            url: getUTUrl(image.utKey)
        })
    }

    return result
}

export const toPusherKey = (key: string) => key.replace(/:/g, '__')

export function getUTUrl(utKey: string) {
    return `https://utfs.io/a/${env.NEXT_PUBLIC_UPLOADTHING_APP_ID}/${utKey}`
}
