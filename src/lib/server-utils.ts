import { Commission } from '@prisma/client'
import { getPlaiceholder } from 'plaiceholder'
import { CommissionAvailability } from '~/core/structures'
import { db } from '~/server/db'

/**
 * Creates a blur_data placeholder for the given image
 *
 * @param {string} src - The source url
 * @returns - The blur_data from the image
 */
export async function get_blur_data(src: string) {
    const buffer = await fetch(src).then(async (res) =>
        Buffer.from(await res.arrayBuffer())
    )
    const data = await getPlaiceholder(buffer)

    return data
}

/**
 * Updates the availability of a commission in the database
 *
 * @param {string} commission - The commission data
 * @return {boolean} - whether or not the request has been waitlisted
 */
export async function update_commission_check_waitlist(commission: Commission) {
    // Check if the commission is full
    if (commission.availability === CommissionAvailability.Closed) {
        return true
    }

    // Get the current availability
    let availability = commission.availability

    // Check if the commission is full and if it is then waitlist the request
    if (
        commission.newSubmissions + 1 >= commission.maxCommissionsUntilWaitlist &&
        commission.maxCommissionsUntilWaitlist !== 0
    ) {
        availability = CommissionAvailability.Waitlist
    }

    // Check if the commission waitlist is full and if it is then close the commission
    if (
        commission.newSubmissions + 1 >= commission.maxCommissionsUntilClosed &&
        commission.maxCommissionsUntilClosed !== 0
    ) {
        availability = CommissionAvailability.Closed
    }

    // Update the commission availability in the database
    // Also increments the submissions and newSubmissions
    // to keep track of the number of submissions
    await db.commission.update({
        where: {
            id: commission.id
        },
        data: {
            submissions: {
                increment: 1
            },
            newSubmissions: {
                increment: 1
            },
            availability
        }
    })

    // Return whether or not the request has been waitlisted
    return availability === CommissionAvailability.Waitlist
}
