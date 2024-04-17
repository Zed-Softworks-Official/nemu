import { RouterInput } from "~/core/structures"

export enum PurchaseType {
    ArtistCorner = 0,
    CommissionInvoice,
    Supporter
}

export enum PaymentStatus {
    RequiresCapture,
    Cancelled,
    Captured,
    RequiresInvoice,
    InvoiceCreated,
    InvoiceNeedsPayment
}

export interface StripePaymentMetadata {
    purchase_type: PurchaseType
    user_id: string
    commission_id?: string
    invoice_id?: string
    order_id?: string
    file_key?: string
    artist_id?: string
    product_id?: string
    form_content?: string
    form_id?: string
}

export interface CheckoutData {
    customer_id: string
    price: number
    stripe_account: string
    return_url: string
    user_id: string
}

export interface StripeProductCheckoutData extends CheckoutData {
    product_id: string
    artist_id: string
    supporter: boolean
}

export type StripeGetClientSecretInput = RouterInput['stripe']['get_client_secret']