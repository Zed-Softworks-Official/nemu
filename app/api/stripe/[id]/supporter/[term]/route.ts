import { StripeCreateCustomerZed, StripeCreateSupporterCheckout } from '@/core/payments'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

/**
 * Redirects the user to a stripe checkout page for the desired length
 *
 * @param {string} id - The user id of the person making the request
 * @param {'monthly' | 'yearly'} term - The length of the subscription the user wants to subscribe to
 */
export async function GET(
    req: Request,
    { params }: { params: { id: string; term: 'monthly' | 'yearly' } }
) {
    const artist = await prisma.artist.findFirst({
        where: {
            userId: params.id
        },
        include: {
            user: true
        }
    })

    if (!artist) {
        return NextResponse.error()
    }

    if (!artist.zedCustomerId) {
        const stripe_customer = await StripeCreateCustomerZed(
            artist.handle,
            artist.user.email || undefined
        )

        await prisma.artist.update({
            where: {
                id: artist.id
            },
            data: {
                zedCustomerId: stripe_customer.id
            }
        })

        artist.zedCustomerId = stripe_customer.id
    }

    return NextResponse.redirect(
        (
            await StripeCreateSupporterCheckout(
                artist.id,
                params.term,
                artist.zedCustomerId
            )
        ).url!
    )
}
