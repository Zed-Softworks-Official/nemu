import { NextResponse } from 'next/server'

import { StripeGetWebhookEvent as StripeStripeWebhookEvent } from '@/helpers/stripe'
import { NemuResponse, StatusCode } from '@/helpers/api/request-inerfaces'
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
                            customer_id: checkout_session.customer?.toString()
                        }
                    })

                    // Create purchased object in the db
                    await prisma.purchased.create({
                        data: {
                            userId: user?.id!,
                            customerId: user?.customer_id!,
                            productId: checkout_session.payment_intent?.toString()!,
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
