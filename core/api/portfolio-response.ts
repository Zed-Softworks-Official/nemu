import { PortfolioItem } from '../data-structures/response-structures'
import { NemuResponse } from './base-response'

/**
 * PortfolioResponse
 * Handles transferring portfolio items
 *
 * @prop {PortfolioItem | null} item - Can contain a SINGLE portfolio item
 * @prop {PortfolioItem[] | null} items - Can contain MULTIPLE portfolio items
 */
export interface PortfolioResponse {
    artist: {
        portfolioItems: {
            image: string,
            name: string
        }[]
    }
}