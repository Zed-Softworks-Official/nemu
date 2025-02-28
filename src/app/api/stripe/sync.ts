import type Stripe from 'stripe'
import { and, eq } from 'drizzle-orm'

import { env } from '~/env'

import { db } from '~/server/db'
import { artists, invoices, purchase } from '~/server/db/schema'
import { KnockWorkflows, send_notification } from '~/server/knock'
import { stripe } from '~/server/stripe'
import { get_redis_key, redis } from '~/server/redis'

import {
    type StripeSubData,
    type StripeInvoiceData,
    type StripePaymentMetadata
} from '~/lib/structures'

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
        case 'account.updated':
            return await account_updated(metadata.stripe_account)
        case 'checkout.session.completed':
            if (metadata.purchase_type === 'artist_corner') {
                return await checkoutSessionCompleted({
                    session_id: event_data.id,
                    stripe_account: metadata.stripe_account,
                    purchase_id: metadata.purchase_id
                })
            }
            break
        case 'checkout.session.expired':
            if (metadata.purchase_type === 'artist_corner') {
                return await checkoutSessionExpired({
                    session_id: event_data.id,
                    stripe_account: metadata.stripe_account,
                    purchase_id: metadata.purchase_id
                })
            }
            break
    }

    return await sync_sub_stripe_data(customer_id)
}

/**
 * Updates the subscription data for a customer
 *
 * @param {string} customer_id - The customer id
 * @returns {Promise<StripeSubData>} The subscription data
 */
export async function sync_sub_stripe_data(customer_id: string) {
    const subscriptions = await stripe.subscriptions.list({
        customer: customer_id,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method']
    })

    if (subscriptions.data.length === 0) {
        const subData = { status: 'none' } satisfies StripeSubData
        await redis.set(get_redis_key('stripe:customer', customer_id), subData)
        return subData
    }

    const subscription = subscriptions.data[0]
    if (!subscription) {
        const subData = { status: 'none' } satisfies StripeSubData
        await redis.set(get_redis_key('stripe:customer', customer_id), subData)
        return subData
    }

    const subData = {
        subscription_id: subscription.id,
        status: subscription.status,
        price_id: subscription.items.data[0]!.price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        payment_method:
            subscription.default_payment_method &&
            typeof subscription.default_payment_method !== 'string'
                ? {
                      brand: subscription.default_payment_method.card?.brand ?? null,
                      last4: subscription.default_payment_method.card?.last4 ?? null
                  }
                : null
    } satisfies StripeSubData

    await redis.set(get_redis_key('stripe:customer', customer_id), subData)
    return subData
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

    const invoice_data = await redis.get<StripeInvoiceData>(
        get_redis_key('invoices', invoice_id)
    )

    if (!invoice_data) {
        throw new Error('[STRIPE HOOK] Invoice not found')
    }

    await redis.set(get_redis_key('invoices', invoice_id), {
        ...invoice_data,
        status: 'paid'
    } satisfies StripeInvoiceData)

    await redis.zrem('invoices_due_cron', invoice_id)

    const update_promise = db
        .update(invoices)
        .set({
            status: 'paid'
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

export async function is_supporter(user_id: string) {
    let supporter = false
    const stripe_customer_id = await redis.get<string>(
        get_redis_key('stripe:user', user_id)
    )
    if (stripe_customer_id) {
        const sub_data = await redis.get<StripeSubData>(
            get_redis_key('stripe:customer', stripe_customer_id)
        )

        if (sub_data?.status === 'active') {
            supporter = true
        }
    }

    return supporter
}

async function checkoutSessionCompleted(data: {
    session_id: string
    stripe_account: string
    purchase_id: string
}) {
    // Get the checkout session
    const session = await stripe.checkout.sessions.retrieve(data.session_id, {
        stripeAccount: data.stripe_account
    })

    if (session.status !== 'complete') {
        throw new Error('[STRIPE HOOK] Checkout session not completed')
    }

    // Update the purchase
    await db
        .update(purchase)
        .set({
            status: 'completed'
        })
        .where(eq(purchase.id, data.purchase_id))
}

async function checkoutSessionExpired(data: {
    session_id: string
    stripe_account: string
    purchase_id: string
}) {
    await db
        .update(purchase)
        .set({
            status: 'cancelled'
        })
        .where(eq(purchase.id, data.purchase_id))
}
