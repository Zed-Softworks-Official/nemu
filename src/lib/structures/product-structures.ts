export const purchaseStatus = ['pending', 'completed', 'cancelled'] as const
export type PurchaseStatus = (typeof purchaseStatus)[number]

export type StripeProductData = {
    product_id: string
    price_id: string
    price: number
    revenue: number
    sold: number
    sold_amount: number
    refund_count: number
    refund_amount: number
    first_sale_date?: Date
    last_sale_date?: Date
}

export type DownloadData = {
    ut_key: string
    filename: string
    size: number
}
