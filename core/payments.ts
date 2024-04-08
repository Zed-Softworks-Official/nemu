export * from './stripe/artist-corner'
export * from './stripe/accounts'
export * from './stripe/customers'
export * from './stripe/prices'
export * from './stripe/webhook'

/**
 * Calculates the application fee amount
 * 
 * @param {number} amount - The price to caluclate from 
 * @returns the total amount that zed softworks receives
 */
export const CalculateApplicationFee = (amount: number) => amount - amount * 0.95
