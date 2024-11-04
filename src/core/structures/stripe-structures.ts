export enum PurchaseType {
    ArtistCorner = 'artist_corner',
    CommissionInvoice = 'commission_invoice',
    Supporter = 'supporter'
}

export enum InvoiceStatus {
    Creating = 'creating',
    Pending = 'pending',
    Paid = 'paid',
    Cancelled = 'cancelled'
}

export type InvoiceItem = {
    id: string | null
    name: string
    price: number
    quantity: number
}

export type StripePaymentMetadata = {
    purchase_type: PurchaseType
    user_id: string
    commission_id?: string
    invoice_id?: string
    order_id?: string
    artist_id?: string
    product_id?: string
}

export type CheckoutData = {
    customer_id: string
    price: number
    stripe_account: string
    return_url: string
    user_id: string
}

export type StripeProductCheckoutData = CheckoutData & {
    product_id: string
    artist_id: string
    supporter: boolean
}

export type StripeDashboardData = {
    managment: {
        type: 'dashboard' | 'onboarding'
        url: string
    }

    checkout_portal?: string
}
