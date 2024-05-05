import { User } from '@clerk/nextjs/server'

/**
 * Types of verification that can be used
 */
export enum VerificationMethod {
    Code = 'artist_code',
    Twitter = 'twitter',
    Email = 'email'
}

/**
 * Enumeration for the different social agents
 */
export enum SocialAgent {
    Twitter = 'twitter',
    Pixiv = 'pixiv',
    Website = 'website'
}

/**
 * Social Account Type
 */
export type SocialAccount = {
    agent: SocialAgent
    url: string
}

/**
 * Client Artist Data
 */
export type ClientArtist = {
    id: string
    handle: string
    header_photo: string
    about: string
    location: string
    terms: string
    supporter: boolean

    user: User
    socials: SocialAccount[] | null

    tip_jar_url?: string
}
