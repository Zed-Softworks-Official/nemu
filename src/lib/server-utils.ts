import { eq, InferSelectModel, sql } from 'drizzle-orm'
import { CommissionAvailability, NemuEditImageData, NemuImageData } from '~/core/structures'
import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'
import { get_blur_data } from './blur_data'

/**
 * Updates the availability of a commission in the database
 *
 * @param {string} commission - The commission data
 * @return {boolean} - whether or not the request has been waitlisted
 */
export async function update_commission_check_waitlist(
    commission: InferSelectModel<typeof commissions>
) {
    // Check if the commission is full
    if (commission.availability === CommissionAvailability.Closed) {
        return true
    }

    // Get the current availability
    let availability = commission.availability

    // Check if the commission is full and if it is then waitlist the request
    if (
        commission.new_requests! + 1 >= commission.max_commissions_until_waitlist! &&
        commission.max_commissions_until_waitlist !== 0
    ) {
        availability = CommissionAvailability.Waitlist
    }

    // Check if the commission waitlist is full and if it is then close the commission
    if (
        commission.new_requests + 1 >= commission.max_commissions_until_closed &&
        commission.max_commissions_until_closed !== 0
    ) {
        availability = CommissionAvailability.Closed
    }

    // Update the commission availability in the database
    // Also increments the totalRequests and newRequests
    // to keep track of the number of submissions
    await db
        .update(commissions)
        .set({
            total_requests: sql`${commissions.total_requests} + 1`,
            new_requests: sql`${commissions.new_requests} + 1`,
            availability
        })
        .where(eq(commissions.id, commission.id))

    // Return whether or not the request has been waitlisted
    return availability === CommissionAvailability.Waitlist
}

/**
 * Converts a list of images to a list of NemuImageData
 *
 * @param {string[]} images - The images to convert
 * @returns {NemuImageData[]} - The converted images
 */
export async function convert_images_to_nemu_images(images: NemuImageData[]) {
    // Format for client
    const result: NemuImageData[] = []

    for (const image of images) {
        result.push({
            url: image.url,
            blur_data: await get_blur_data(image.url)
        })
    }

    return result
}

export async function convert_images_to_nemu_images_editable(images: NemuImageData[]) {
    // Format for client
    const result: NemuEditImageData[] = []

    for (const image of images) {
        result.push({
            action: 'update',
            image_data: image
        })
    }

    return result
}
