import { InferSelectModel } from 'drizzle-orm'
import { getPlaiceholder } from 'plaiceholder'
import { ClientCommissionItem, CommissionAvailability, NemuImageData } from '~/core/structures'
import { db } from '~/server/db'
import { commissions } from '~/server/db/schema'

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
export async function update_commission_check_waitlist(commission: InferSelectModel<typeof commissions>) {
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
        commission.newRequests + 1 >= commission.maxCommissionsUntilClosed &&
        commission.maxCommissionsUntilClosed !== 0
    ) {
        availability = CommissionAvailability.Closed
    }

    // Update the commission availability in the database
    // Also increments the totalRequests and newRequests
    // to keep track of the number of submissions
    // await db.commission.update({
    //     where: {
    //         id: commission.id
    //     },
    //     data: {
    //         totalRequests: {
    //             increment: 1
    //         },
    //         newRequests: {
    //             increment: 1
    //         },
    //         availability
    //     }
    // })

    // Return whether or not the request has been waitlisted
    return availability === CommissionAvailability.Waitlist
}

/**
 * Converts a list of images to a list of NemuImageData
 * 
 * @param {string[]} images - The images to convert
 * @returns {NemuImageData[]} - The converted images
 */
export async function convert_images_to_nemu_images(images: string[]) {
    // Format for client
    const result: NemuImageData[] = []

    for (const image of images) {
        result.push({
            url: image,
            blur_data: (await get_blur_data(image)).base64
        })
    }

    return result
}
