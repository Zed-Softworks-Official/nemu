import { env } from '@/env'
import { stripe } from '@/lib/stripe'

/**
 * Creates a stripe wehbook event
 *
 * @param {string | Buffer} payload  - The body of the request
 * @param {string | Buffer | string[]} header - The header to look for
 * @returns a webhook event from stripe
 */
export function StripeGetWebhookEvent(
    payload: string | Buffer,
    header: string | Buffer | string[]
) {
    return stripe.webhooks.constructEvent(
        payload,
        header,
        env.STRIPE_WEBHOOK_SECRET!
    )
}
