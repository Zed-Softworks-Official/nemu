export * from '~/lib/payments/accounts'
export * from '~/lib/payments/supporter'
export * from '~/lib/payments/customer'
export * from '~/lib/payments/commission'

/**
 * Calculates the application fee amount
 *
 * @param {number} amount - The price to caluclate from
 * @returns the total amount that zed softworks receives
 */
export const calculate_application_fee = (amount: number) => amount - amount * 0.95
