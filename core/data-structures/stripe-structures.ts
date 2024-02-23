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
    commission_id: string
    user_id: string
    order_id?: string
    product_id?: string
    form_content?: string
    form_id?: string
}

export interface StripeCommissionCheckoutData {
    customer_id: string
    price: number
    user_id: string
    stripe_account: string
    return_url: string
    form_id: string
    form_content: string,
    commission_id: string
}