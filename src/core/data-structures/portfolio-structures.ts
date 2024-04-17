import { Portfolio } from '@prisma/client'
import { NemuImageData, OverwriteType } from '~/core/structures'

/**
 * Client Side Portfolio Item, It basically contains all of same stuff as the prisma item
 * However, the images also includes blur data instead of just the url for the image
 */
export type ClientPortfolioItem = OverwriteType<Portfolio, { image: NemuImageData }>
