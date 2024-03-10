import { Artist, User, ArtistVerification } from '@prisma/client'
import { NemuResponse } from './base-response'
import { CommissionItem, PortfolioItem, ShopItem, SocialData } from '../structures'

/**
 * ArtistResponse
 * Handles transfering the full artist object
 *
 * @prop {Artist | null} info - The artist info from our database
 */
export interface ArtistResponse extends NemuResponse {
    info: Artist | null
}

/**
 * ArtistPageResponse
 * Handles transfering the full artist object with the user
 *
 * @prop {Artist | null} info - The artist info from our database
 */
export interface ArtistPageResponse {
    artist?: {
        id: string
        headerPhoto: string
        profilePhoto: string
        handle: string
        about: string
        location: string
        stripeAccount: string
        store_items: ShopItem[]
        commissions: CommissionItem[]
        portfolio_items: PortfolioItem[]
        socials: SocialData[]
        user: {
            name: string
        }
    }
}

/**
 * ArtistVerificationResponse
 * Handles transfering all artists inside of the verification table
 *
 * @prop {ArtistVerification[] | null} artists - The artists within the verification table
 */
export interface ArtistVerificationResponse extends NemuResponse {
    artists?: ArtistVerification[] | null
}

/**
 * ArtistCodeResponse
 * Handles transfering an artist code
 *
 * @prop {string} generated_code - The generated artist code to hand to an artist
 */
export interface ArtistCodeResponse extends NemuResponse {
    generated_code?: string
}

/**
 * RandomArtistsResponse
 * Gets a random array of artists
 *
 * @prop {Artist[] | undefined} artists - Array of a certain number of random artists
 */
export interface RandomArtistsResponse extends NemuResponse {
    artists?: Artist[]
}
