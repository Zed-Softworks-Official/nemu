export * from '~/core/stripe/accounts'
export * from '~/core/stripe/supporter'
export * from '~/core/stripe/customer'
export * from '~/core/stripe/artist-corner'
export * from '~/core/stripe/commission'

/**
 * Calculates the application fee amount
 * 
 * @param {number} amount - The price to caluclate from 
 * @returns the total amount that zed softworks receives
 */
export const CalculateApplicationFee = (amount: number) => amount - amount * 0.95