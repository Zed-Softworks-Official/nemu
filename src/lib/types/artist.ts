import { z } from 'zod'

/**
 * Types of verification that can be used
 */
export const verificationMethods = ['artist_code', 'twitter', 'email'] as const
export type VerificationMethod = (typeof verificationMethods)[number]

/**
 * Enumeration for the different social agents
 */
export const socialAgents = ['twitter', 'pixiv', 'website'] as const
export type SocialAgent = (typeof socialAgents)[number]

/**
 * Social Account Type
 */
export type SocialAccount = {
    agent: SocialAgent
    url: string
}

export const verification_data = z.object({
    method: z.literal('artist_code').or(z.literal('twitter')),
    requestedHandle: z
        .string()
        .min(1, 'Handles must be longer then one character')
        .refine(
            (value) => !value.includes('@'),
            'Handles will contain "@" by default, no need to add them'
        ),
    twitter: z.string().url('Must be a valid url'),
    website: z.string().url('Must be a valid url').optional().or(z.literal('')),
    location: z.string(),
    artistCode: z.string().optional()
})

export type VerificationDataType = z.infer<typeof verification_data>

export const conStatus = ['active', 'expired'] as const
export type ConStatus = (typeof conStatus)[number]
