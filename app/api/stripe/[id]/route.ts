import {
    StripeCreateAccount,
    StripeCreateAccountLink,
    StripeCreateLoginLink,
    StripeGetAccount
} from '@/helpers/stripe'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    // Check if they have a stripe account
    // if they don't then create one and return the onboarding url
    if (!artist?.stripeAccId) {
        const stripe_account = await StripeCreateAccount()
        return NextResponse.json({
            onboarding_url: (await StripeCreateAccountLink(stripe_account.id)).url
        })
    }

    // Get the stripe account if they have one
    const stripe_account = await StripeGetAccount(artist?.stripeAccId)

    // If the user has not completed the onboarding, return an onboarding url
    if (!stripe_account.charges_enabled) {
        return NextResponse.json({
            onboarding_url: (await StripeCreateAccountLink(stripe_account.id)).url
        })
    }

    // Return the dashboard url if the artist has completed onboarding and has an account
    return NextResponse.json({
        raw: stripe_account,
        dashboard_url: (await StripeCreateLoginLink(stripe_account.id)).url
    })
}
