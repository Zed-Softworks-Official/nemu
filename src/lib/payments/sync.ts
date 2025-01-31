import type Stripe from 'stripe'
import { and, eq } from 'drizzle-orm'

import { db } from '~/server/db'
import { artists, invoices, requests } from '~/server/db/schema'
import { KnockWorkflows, send_notification } from '~/server/knock'

import { env } from '~/env'

import {
    InvoiceStatus,
    RequestStatus,
    type StripePaymentMetadata
} from '~/lib/structures'
import { stripe } from '~/server/stripe'
import { get_redis_key, redis } from '~/server/redis'

export async function sync_stripe_data(
    customer_id: string,
    metadata: StripePaymentMetadata,
    event_data: {
        id: string
        type: Stripe.Event.Type
    }
) {
    switch (event_data.type) {
        case 'invoice.paid':
            return await invoice_paid(event_data.id, metadata.stripe_account)
        case 'invoice.payment_failed':
            return await invoice_payment_failed(event_data.id, metadata.stripe_account)
        case 'account.updated':
            return await account_updated(metadata.stripe_account)
        default:
            return await update_subscription(customer_id)
    }
}

/**
 * Updates the invoice status to paid
 *
 * @param {string} invoice_id - The invoice id
 * @param {string} stripe_account - The stripe account id
 */
async function invoice_paid(invoice_id: string, stripe_account: string) {
    const stripe_invoice = await stripe.invoices.retrieve(invoice_id, {
        stripeAccount: stripe_account
    })

    if (stripe_invoice.status !== 'paid') {
        throw Error('[STRIPE HOOK] HOW????')
    }

    const update_promise = db
        .update(invoices)
        .set({
            status: InvoiceStatus.Paid
        })
        .where(
            and(
                eq(invoices.stripe_id, invoice_id),
                eq(invoices.stripe_account, stripe_account)
            )
        )

    const query_promise = db.query.invoices.findFirst({
        where: and(
            eq(invoices.stripe_id, invoice_id),
            eq(invoices.stripe_account, stripe_account)
        ),
        with: {
            request: {
                with: {
                    commission: true
                }
            },
            artist: true
        }
    })

    const [, invoice] = await Promise.all([update_promise, query_promise])

    if (!invoice) {
        throw new Error('[STRIPE HOOK] Invoice not found')
    }

    await send_notification({
        type: KnockWorkflows.InvoicePaid,
        recipients: [invoice.artist.user_id],
        data: {
            commission_title: invoice.request.commission.title,
            request_url: `${env.BASE_URL}/dashboard/commissions/${invoice.request.commission.slug}/${invoice.request.order_id}`
        },
        actor: invoice.user_id
    })
}

/**
 * Handles the invoice overdue event
 *
 * @param {string} invoice_id - The invoice id
 * @param {string} stripe_account - The stripe account id
 */
async function invoice_payment_failed(invoice_id: string, stripe_account: string) {
    const stripe_invoice = await stripe.invoices.retrieve(invoice_id, {
        stripeAccount: stripe_account
    })

    // Only proceed if the invoice is overdue and NOT if the payment on their card failed
    if (!stripe_invoice.due_date || stripe_invoice.due_date * 1000 > Date.now()) {
        return
    }

    await stripe.invoices.markUncollectible(invoice_id, {
        stripeAccount: stripe_account
    })

    const request_invoice = await db.query.invoices.findFirst({
        where: and(
            eq(invoices.stripe_id, invoice_id),
            eq(invoices.stripe_account, stripe_account)
        ),
        with: {
            request: {
                with: {
                    commission: true
                }
            },
            artist: true
        }
    })

    if (!request_invoice) {
        throw new Error('[STRIPE HOOK] Invoice not found')
    }

    const update_promise = db
        .update(requests)
        .set({
            status: RequestStatus.Rejected
        })
        .where(eq(requests.id, request_invoice.request_id))

    const notification_promise = send_notification({
        type: KnockWorkflows.InvoiceOverdue,
        recipients: [request_invoice.artist.user_id, request_invoice.user_id],
        data: {
            artist_handle: request_invoice.artist.handle,
            commission_title: request_invoice.request.commission.title,
            commission_url: `${env.BASE_URL}/@${request_invoice.artist.handle}/commission/${request_invoice.request.commission.slug}`
        }
    })

    await Promise.all([update_promise, notification_promise])
}

async function update_subscription(customer_id: string) {
    const subscriptions = await stripe.subscriptions.list({
        customer: customer_id,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method']
    })

    if (subscriptions.data.length === 0) {
        return
    }

    const subscription = subscriptions.data[0]!

    await db
        .update(artists)
        .set({
            supporter: subscription.status === 'active'
        })
        .where(eq(artists.zed_customer_id, customer_id))
}

async function account_updated(stripe_account: string) {
    const account = await stripe.accounts.retrieve({
        stripeAccount: stripe_account
    })

    // Only proceed if this is an onboarding completion
    if (!account.charges_enabled || !account.details_submitted) {
        return
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.stripe_account, stripe_account)
    })

    if (!artist) {
        return
    }

    const update_promise = db
        .update(artists)
        .set({
            onboarded: true
        })
        .where(eq(artists.id, artist.id))

    const redis_promise = redis.del(get_redis_key('dashboard_links', artist.id))

    await Promise.all([update_promise, redis_promise])
}
