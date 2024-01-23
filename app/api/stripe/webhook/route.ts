import { NextResponse } from 'next/server'

import { StripeGetWebhookEvent as StripeStripeWebhookEvent } from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
    const sig = req.headers.get('stripe-signature')

    if (!req.body) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Invalid request body'
        })
    }

    let event
    try {
        event = StripeStripeWebhookEvent(await req.text(), sig!)
    } catch (e) {
        console.log(e)

        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Failed to create event'
        })
    }

    switch (event.type) {
        case 'checkout.session.completed':
            {
                const checkout_session = event.data.object
                if (checkout_session.payment_status === 'paid') {
                    // Get user from customer id
                    const user = await prisma.user.findFirst({
                        where: {
                            id: checkout_session.metadata?.user_id!
                        }
                    })

                    const purchased = await prisma.purchased.findFirst({
                        where: {
                            userId: user?.id,
                            customerId: checkout_session.customer?.toString(),
                            productId: checkout_session.metadata?.product_id,
                            stripeAccId: checkout_session.metadata?.stripe_account
                        }
                    })

                    // Update user with new purchase
                    await prisma.purchased.update({
                        where: {
                            id: purchased?.id
                        },
                        data: {
                            complete: true
                        }
                    })
                }
            }
            break
        default:
            //console.log(`Error Handling Stripe Event: ${event.type}`)
            break
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
