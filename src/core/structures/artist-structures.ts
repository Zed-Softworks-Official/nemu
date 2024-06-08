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
