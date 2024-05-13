export * from '~/core/payments/accounts'
export * from '~/core/payments/supporter'
export * from '~/core/payments/customer'
export * from '~/core/payments/artist-corner'
export * from '~/core/payments/commission'

/**
 * Calculates the application fee amount
 * 
 * @param {number} amount - The price to caluclate from 
 * @returns the total amount that zed softworks receives
 */
export const CalculateApplicationFee = (amount: number) => amount - amount * 0.95