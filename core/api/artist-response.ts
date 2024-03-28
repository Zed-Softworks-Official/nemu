import { Artist, User, ArtistVerification, Commission, Social } from '@prisma/client'
import { NemuResponse, RouterOutput } from './base-response'
import { CommissionItem } from '../structures'

export type ArtistPageResponse = RouterOutput['get_artist']

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
