import { z } from 'zod'

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

export const verification_data = z.object({
    method: z.literal('artist_code').or(z.literal('twitter')),
    requested_handle: z
        .string()
        .min(1, 'Handles must be longer then one character')
        .refine(
            (value) => !value.includes('@'),
            'Handles will contain "@" by default, no need to add them'
        ),
    twitter: z.string().url('Must be a valid url'),
    website: z.string().url('Must be a valid url').optional().or(z.literal('')),
    location: z.string(),
    artist_code: z.string().optional()
})

export type VerificationDataType = z.infer<typeof verification_data>

export const conStatus = ['active', 'expired'] as const
export type ConStatus = (typeof conStatus)[number]

export const purchaseStatus = ['pending', 'completed', 'cancelled'] as const
export type PurchaseStatus = (typeof purchaseStatus)[number]
