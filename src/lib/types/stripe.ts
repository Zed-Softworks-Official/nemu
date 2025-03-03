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
          purchaseType: 'commission_invoice'
          stripeAccount: string
          orderId: string
      }
    | {
          purchaseType: 'artist_corner'
          stripeAccount: string
          purchaseId: string
      }
    | {
          purchaseType: 'supporter'
          stripeAccount: string
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
          subscriptionId: string | null
          status: Stripe.Subscription.Status
          priceId: string | null
          currentPeriodStart: number | null
          currentPeriodEnd: number | null
          cancelAtPeriodEnd: boolean
          paymentMethod: {
              brand: string | null // e.g., "visa", "mastercard"
              last4: string | null // e.g., "4242"
          } | null
      }
    | {
          status: 'none'
      }

export type SalesData = {
    month: string
    totalSales: number
}
