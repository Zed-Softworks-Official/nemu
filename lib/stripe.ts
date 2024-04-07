import { env } from '@/env'
import Stripe from 'stripe'

const globalForStripe = global as unknown as { stripe: Stripe }

export const stripe =
    globalForStripe.stripe ||
    new Stripe(env.STRIPE_API_KEY, {
        apiVersion: '2023-10-16'
    })

if (env.NODE_ENV !== 'production') globalForStripe.stripe = stripe
