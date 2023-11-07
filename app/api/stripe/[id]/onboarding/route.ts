import { prisma } from '@/lib/prisma'
import { NextApiResponse } from 'next'

import { redirect } from 'next/dist/server/api-utils'
import { StripeCreateAccount, StripeCreateAccountLink } from '@/helpers/stripe'

export async function GET(res: NextApiResponse, {params}: { params: {user_id: string}}) {
    // Create Stripe Account
    const account = await StripeCreateAccount()
    
    await prisma.artist.update({
        where: {
            userId: params.user_id
        },
        data: {
            stripeAccId: account.id
        }
    })

    return redirect(res, 301, (await StripeCreateAccountLink(account.id)).url)
}
