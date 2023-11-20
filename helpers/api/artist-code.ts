import { prisma } from '@/lib/prisma'

/**
 * Destroys a specific artist code from the database
 *
 * @param {string} code - The artist code to destroy in the database
 */
export async function DestroyArtistCode(code: string) {
    let artistCodeObject = await prisma.aritstCode.findFirst({
        where: {
            code: code
        }
    })

    await prisma.aritstCode.delete({
        where: {
            id: artistCodeObject?.id
        }
    })
}
