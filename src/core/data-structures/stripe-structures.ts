import { RouterInput } from '~/core/structures'

export enum PurchaseType {
    ArtistCorner = 0,
    CommissionInvoice,
    Supporter
}

export enum InvoiceStatus {
    Creating = 0,
    Pending = 0,
    Paid,
    Cancelled
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

export type StripeGetClientSecretInput = RouterInput['stripe']['get_client_secret']
