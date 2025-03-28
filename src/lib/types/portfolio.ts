import type { ClientNemuImageData } from '~/lib/types/image'

/**
 * Client Side Portfolio Item, It basically contains all of same stuff as the prisma item
 * However, the images also includes blur data instead of just the url for the image
 */
export type ClientPortfolioItem = {
    id: string
    title: string
    image: ClientNemuImageData
}
