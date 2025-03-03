import type Stripe from 'stripe'
import { and, eq } from 'drizzle-orm'

import { env } from '~/env'

import { db } from '~/server/db'
import { artists, invoices, purchase } from '~/server/db/schema'
import { KnockWorkflows, sendNotification } from '~/server/knock'
import { stripe } from '~/server/stripe'
import { getRedisKey, redis } from '~/server/redis'

import {
    type StripeSubData,
    type StripeInvoiceData,
    type StripePaymentMetadata
} from '~/lib/types'

export async function syncStripeData(
    customerId: string,
    metadata: StripePaymentMetadata,
    eventData: {
        id: string
        type: Stripe.Event.Type
    }
) {
    switch (eventData.type) {
        case 'invoice.paid':
            return await invoicePaid(eventData.id, metadata.stripeAccount)
        case 'account.updated':
            return await accountUpdated(metadata.stripeAccount)
        case 'checkout.session.completed':
            if (metadata.purchaseType === 'artist_corner') {
                return await checkoutSessionCompleted({
                    sessionId: eventData.id,
                    stripeAccount: metadata.stripeAccount,
                    purchaseId: metadata.purchaseId
                })
            }
            break
        case 'checkout.session.expired':
            if (metadata.purchaseType === 'artist_corner') {
                return await checkoutSessionExpired({
                    sessionId: eventData.id,
                    stripeAccount: metadata.stripeAccount,
                    purchaseId: metadata.purchaseId
                })
            }
            break
    }

    return await syncStripeSubData(customerId)
}

/**
 * Updates the subscription data for a customer
 *
 * @param {string} customer_id - The customer id
 * @returns {Promise<StripeSubData>} The subscription data
 */
export async function syncStripeSubData(customer_id: string) {
    const subscriptions = await stripe.subscriptions.list({
        customer: customer_id,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method']
    })

    if (subscriptions.data.length === 0) {
        const subData = { status: 'none' } satisfies StripeSubData
        await redis.set(getRedisKey('stripe:customer', customer_id), subData)
        return subData
    }

    const subscription = subscriptions.data[0]
    if (!subscription) {
        const subData = { status: 'none' } satisfies StripeSubData
        await redis.set(getRedisKey('stripe:customer', customer_id), subData)
        return subData
    }

    const subData = {
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price.id ?? null,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        paymentMethod:
            subscription.default_payment_method &&
            typeof subscription.default_payment_method !== 'string'
                ? {
                      brand: subscription.default_payment_method.card?.brand ?? null,
                      last4: subscription.default_payment_method.card?.last4 ?? null
                  }
                : null
    } satisfies StripeSubData

    await redis.set(getRedisKey('stripe:customer', customer_id), subData)
    return subData
}

/**
 * Updates the invoice status to paid
 *
 * @param {string} invoice_id - The invoice id
 * @param {string} stripe_account - The stripe account id
 */
async function invoicePaid(invoice_id: string, stripe_account: string) {
    const stripe_invoice = await stripe.invoices.retrieve(invoice_id, {
        stripeAccount: stripe_account
    })

    if (stripe_invoice.status !== 'paid') {
        throw Error('[STRIPE HOOK] HOW????')
    }

    const invoice_data = await redis.get<StripeInvoiceData>(
        getRedisKey('invoices', invoice_id)
    )

    if (!invoice_data) {
        throw new Error('[STRIPE HOOK] Invoice not found')
    }

    await redis.set(getRedisKey('invoices', invoice_id), {
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
                eq(invoices.stripeId, invoice_id),
                eq(invoices.stripeAccount, stripe_account)
            )
        )

    const query_promise = db.query.invoices.findFirst({
        where: and(
            eq(invoices.stripeId, invoice_id),
            eq(invoices.stripeAccount, stripe_account)
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

    await sendNotification({
        type: KnockWorkflows.InvoicePaid,
        recipients: [invoice.artist.userId],
        data: {
            commission_title: invoice.request.commission.title,
            request_url: `${env.BASE_URL}/dashboard/commissions/${invoice.request.commission.slug}/${invoice.request.orderId}`
        },
        actor: invoice.userId
    })
}

async function accountUpdated(stripeAccount: string) {
    const account = await stripe.accounts.retrieve({
        stripeAccount: stripeAccount
    })

    // Only proceed if this is an onboarding completion
    if (!account.charges_enabled || !account.details_submitted) {
        return
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.stripeAccount, stripeAccount)
    })

    if (!artist) {
        return
    }

    const updatePromise = db
        .update(artists)
        .set({
            onboarded: true
        })
        .where(eq(artists.id, artist.id))

    const redisPromise = redis.del(getRedisKey('dashboard_links', artist.id))

    await Promise.all([updatePromise, redisPromise])
}

export async function isSupporter(user_id: string) {
    let supporter = false
    const stripeCustomerId = await redis.get<string>(getRedisKey('stripe:user', user_id))
    if (stripeCustomerId) {
        const subData = await redis.get<StripeSubData>(
            getRedisKey('stripe:customer', stripeCustomerId)
        )

        if (subData?.status === 'active') {
            supporter = true
        }
    }

    return supporter
}

async function checkoutSessionCompleted(data: {
    sessionId: string
    stripeAccount: string
    purchaseId: string
}) {
    // Get the checkout session
    const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
        stripeAccount: data.stripeAccount
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
        .where(eq(purchase.id, data.purchaseId))
}

async function checkoutSessionExpired(data: {
    sessionId: string
    stripeAccount: string
    purchaseId: string
}) {
    await db
        .update(purchase)
        .set({
            status: 'cancelled'
        })
        .where(eq(purchase.id, data.purchaseId))
}
