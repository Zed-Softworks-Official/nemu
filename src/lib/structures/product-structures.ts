export const purchaseStatus = ['pending', 'completed', 'cancelled'] as const
export type PurchaseStatus = (typeof purchaseStatus)[number]

export type StripeProductData = {
    product_id: string
    revenue: number
    sold: number
    refund_count: number
    refund_amount: number
    first_sale_date?: Date
    last_sale_date?: Date
}
