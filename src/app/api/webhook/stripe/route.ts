import type Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'
import { waitUntil } from '@vercel/functions'

import { env } from '~/env'

import { stripe } from '~/server/stripe'

import { tryCatch } from '~/lib/try-catch'
import { sync_stripe_data } from '~/lib/payments/sync'
import { type StripePaymentMetadata } from '~/lib/structures'

const allowed_events = [
    'invoice.paid',
    'invoice.overdue',
    'customer.subscription.created',
    'customer.subscription.deleted',
    'account.updated'
] as Stripe.Event.Type[]

async function process_event(event: Stripe.Event) {
    // Skip processing if the event type is not allowed
    if (!allowed_events.includes(event.type)) return

    // ALl the events i track have a customerId
    const {
        customer: customer_id,
        metadata,
        id
    } = event.data.object as unknown as {
        customer: string
        metadata: StripePaymentMetadata
        id: string
    }

    if (typeof customer_id !== 'string') {
        throw new Error(`[STRIPE HOOK]: Id isn\'t a string.\nEvent Type: ${event.type}`)
    }

    return sync_stripe_data(customer_id, metadata, {
        id,
        type: event.type
    })
}

export async function POST(req: NextRequest) {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
        return NextResponse.json({ error: 'Missing body or signature' }, { status: 400 })
    }

    async function do_event_processing() {
        if (typeof signature !== 'string') {
            throw new Error('[STRIPE HOOK]: Signature is not a string???')
        }

        const event = stripe.webhooks.constructEvent(
            body,
            signature,
            env.STRIPE_WEBHOOK_SECRET
        )

        waitUntil(process_event(event))
    }

    const { error } = await tryCatch(do_event_processing())

    if (error) {
        console.error('[STRIPE HOOK]: Error processing event', error)
    }

    return NextResponse.json({ received: true })
}
