export enum PurchaseType {
    ArtistCorner = 0,
    CommissionInvoice,
    CommissionSetupPayment
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
    order_id?: string
    file_key?: string
    artist_id?: string
    product_id?: string
    form_content?: string
    form_id?: string
}

export enum CheckoutType {
    Commission,
    Product
}

export interface CheckoutData {
    checkout_type: CheckoutType
    customer_id: string
    price: number
    stripe_account: string
    return_url: string
    user_id: string
}

export interface StripeCommissionCheckoutData extends CheckoutData {
    form_id: string
    form_content: string,
    commission_id: string
}

export interface StripeProductCheckoutData extends CheckoutData {
    product_id: string
    artist_id: string
}