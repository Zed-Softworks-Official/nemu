import type Stripe from 'stripe'

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

export type StripePaymentMetadata =
    | {
          purchase_type: 'commission_invoice'
          stripe_account: string
          order_id: string
      }
    | {
          purchase_type: 'artist_corner'
          stripe_account: string
          purchase_id: string
      }
    | {
          purchase_type: 'supporter'
          stripe_account: string
      }

export interface StripeDashboardData {
    onboarded: boolean
    managment: {
        type: 'dashboard' | 'onboarding'
        url: string
    }

    checkout_portal?: string
}

export type StripeSubData =
    | {
          subscription_id: string | null
          status: Stripe.Subscription.Status
          price_id: string | null
          current_period_start: number | null
          current_period_end: number | null
          cancel_at_period_end: boolean
          payment_method: {
              brand: string | null // e.g., "visa", "mastercard"
              last4: string | null // e.g., "4242"
          } | null
      }
    | {
          status: 'none'
      }
