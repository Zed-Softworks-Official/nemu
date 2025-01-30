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
    stripe_account: string
    order_id: string
}

export type StripeDashboardData = {
    onboarded: boolean
    managment: {
        type: 'dashboard' | 'onboarding'
        url: string
    }

    checkout_portal?: string
}

export enum ChargeMethod {
    InFull = 'in_full',
    DownPayment = 'down_payment'
}
