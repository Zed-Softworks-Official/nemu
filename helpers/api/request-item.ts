import { prisma } from '@/lib/prisma'
import { PortfolioItem } from './request-inerfaces'
import { AWSLocations, S3GetSignedURL } from '@/helpers/s3'

/**
 * Gets a SINGLE portfolio item for a given user with a provided name
 *
 * @param {string} handle - The artist handle
 * @param {string} id - The filename of the destired file
 * @returns An item from the database, Null if location is not inside the database
 */
export async function GetPortfolioItem(
    handle: string,
    id: string
): Promise<PortfolioItem> {
    // Determine the location of the object
    const database_item = await prisma.portfolio.findFirst({
        where: {
            image: id
        }
    })

    return {
        name: database_item!.name,
        signed_url: await S3GetSignedURL(handle, AWSLocations.Portfolio, id),
        key: id
    }
}
