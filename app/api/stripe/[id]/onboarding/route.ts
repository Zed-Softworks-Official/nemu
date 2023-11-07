import { prisma } from '@/lib/prisma'
import { NextApiResponse } from 'next'

import { NextResponse } from 'next/server'
import { StripeCreateAccount, StripeCreateAccountLink } from '@/helpers/stripe'

export async function GET(res: NextApiResponse, {params}: { params: {id: string}}) {
    // Get The Artist
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        }
    })

    // Check if they already have a stripe account
    if (artist?.stripeAccId) {
        return NextResponse.json({
            account_link: undefined
        })
    }

    // Create Stripe Account
    const account = await StripeCreateAccount()
    
    // Update Artist
    await prisma.artist.update({
        where: {
            userId: params.id
        },
        data: {
            stripeAccId: account.id
        }
    })

    return NextResponse.json({
        account_link: (await StripeCreateAccountLink(account.id)).url
    })
}
