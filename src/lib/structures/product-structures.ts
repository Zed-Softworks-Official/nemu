export const purchaseStatus = ['pending', 'completed', 'cancelled'] as const
export type PurchaseStatus = (typeof purchaseStatus)[number]

export type StripeProductData = {
    productId: string
    priceId: string
    price: number
    revenue: number
    sold: number
    soldAmount: number
    refundCount: number
    refundAmount: number
    firstSaleDate?: Date
    lastSaleDate?: Date
}

export type DownloadData = {
    utKey: string
    filename: string
    size: number
}
