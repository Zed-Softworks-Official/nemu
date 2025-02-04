export const purchaseTypes = ['artist_corner', 'commission_invoice', 'supporter'] as const
export type PurchaseType = (typeof purchaseTypes)[number]

export const invoiceStatuses = ['creating', 'pending', 'paid', 'cancelled'] as const
export type InvoiceStatus = (typeof invoiceStatuses)[number]

export const chargeMethods = ['in_full', 'down_payment'] as const
export type ChargeMethod = (typeof chargeMethods)[number]

export interface InvoiceItem {
    id: string | null
    name: string
    price: number
    quantity: number
}

export interface StripePaymentMetadata {
    purchase_type: PurchaseType
    stripe_account: string
    order_id: string
}

export interface StripeDashboardData {
    onboarded: boolean
    managment: {
        type: 'dashboard' | 'onboarding'
        url: string
    }

    checkout_portal?: string
}
