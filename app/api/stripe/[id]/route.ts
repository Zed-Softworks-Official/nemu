import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import {
    StripeCreateAccount,
    StripeCreateAccountLink,
    StripeCreateLoginLink,
    StripeGetAccount
} from '@/core/payments'

import { StatusCode, StripeAccountResponse } from '@/core/responses'

/**
 * Get's the correct response based on wether an artist is onboarded or not
 *
 * @param id - The user id for the artist
 * @returns A url for either onboarding via stripe or a stripe dashboard
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const artist = await prisma.artist.findFirst({
        where: {
            id: params.id
        }
    })

    // Check if they have a stripe account
    // if they don't then create one and return the onboarding url
    if (!artist?.stripeAccount) {
        const stripe_account = await StripeCreateAccount()
        return NextResponse.json<StripeAccountResponse>({
            status: StatusCode.Success,
            onboarding_url: (await StripeCreateAccountLink(stripe_account.id)).url
        })
    }

    // Get the stripe account if they have one
    const stripe_account = await StripeGetAccount(artist?.stripeAccount)

    // If the user has not completed the onboarding, return an onboarding url
    if (!stripe_account.charges_enabled) {
        return NextResponse.json<StripeAccountResponse>({
            status: StatusCode.Success,
            onboarding_url: (await StripeCreateAccountLink(stripe_account.id)).url
        })
    }

    // Return the dashboard url if the artist has completed onboarding and has an account
    return NextResponse.json<StripeAccountResponse>({
        status: StatusCode.Success,
        raw: stripe_account,
        dashboard_url: (await StripeCreateLoginLink(stripe_account.id)).url
    })
}
