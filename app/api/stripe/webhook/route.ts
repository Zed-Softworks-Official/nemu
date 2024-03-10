import { NextResponse } from 'next/server'

import { StripeGetRawProductInfo, StripeGetStoreProductInfo, StripeGetWebhookEvent as StripeStripeWebhookEvent } from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { PaymentStatus, PurchaseType, StripePaymentMetadata } from '@/core/structures'
import { CheckCreateSendbirdUser, CreateSendbirdMessageChannel, UpdateCommissionAvailability } from '@/core/helpers'

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
        ////////////////////////////////////////////////////////////
        // Payment for Artist Corner Items
        ////////////////////////////////////////////////////////////
        // case 'checkout.session.completed':
        //     {
        //         const checkout_session = event.data.object
        //         if (checkout_session.payment_status === 'paid') {
        //             // Get user from customer id
        //             const user = await prisma.user.findFirst({
        //                 where: {
        //                     id: checkout_session.metadata?.user_id!
        //                 }
        //             })

        //             const purchased = await prisma.purchased.findFirst({
        //                 where: {
        //                     userId: user?.id,
        //                     customerId: checkout_session.customer?.toString(),
        //                     productId: checkout_session.metadata?.product_id,
        //                     stripeAccId: checkout_session.metadata?.stripe_account
        //                 }
        //             })

        //             // Update user with new purchase
        //             await prisma.purchased.update({
        //                 where: {
        //                     id: purchased?.id
        //                 },
        //                 data: {
        //                     complete: true
        //                 }
        //             })
        //         }
        //     }
        //     break

        case 'charge.succeeded':
            {
                const charge = event.data.object
                const metadata = charge.metadata as unknown as StripePaymentMetadata

                switch (Number(metadata.purchase_type) as PurchaseType) {
                    ////////////////////////////////////////////////////////////
                    // Payment Hold for commissions
                    ////////////////////////////////////////////////////////////
                    case PurchaseType.CommissionSetupPayment:
                        {
                            const kanban = await prisma.kanban.create({})
                            const sendbird_channel_url = crypto.randomUUID()

                            // Create Form Submission
                            const submission = await prisma.formSubmission.create({
                                data: {
                                    formId: metadata.form_id!,
                                    content: metadata.form_content!,
                                    userId: metadata.user_id,
                                    paymentIntent: charge.payment_intent?.toString(),
                                    paymentStatus: PaymentStatus.RequiresCapture,
                                    orderId: crypto.randomUUID(),
                                    kanbanId: kanban.id,
                                    sendbirdChannelURL: sendbird_channel_url
                                }
                            })

                            // Update Form Availability if necesary
                            await UpdateCommissionAvailability(metadata.form_id!)

                            // Create a sendbird user if the user that commissioned the artist doesn't have a sendbird account
                            await CheckCreateSendbirdUser(metadata.user_id)

                            // Create Sendbird channel
                            await CreateSendbirdMessageChannel(submission.id, sendbird_channel_url)

                            // Update new submissions count field
                            await prisma.form.update({
                                where: {
                                    id: metadata.form_id
                                },
                                data: {
                                    newSubmissions: {
                                        increment: 1
                                    }
                                }
                            })
                        }
                        break
                    case PurchaseType.CommissionInvoice:
                        break
                    ////////////////////////////////////////////////////////////
                    // Payment for Artist Corner Items
                    ////////////////////////////////////////////////////////////
                    case PurchaseType.ArtistCorner:
                        {
                            const artist = await prisma.artist.findFirst({
                                where: {
                                    id: metadata.artist_id
                                }
                            })

                            const product = await StripeGetRawProductInfo(metadata.product_id!, artist?.stripeAccId!)

                            await prisma.downloads.create({
                                data: {
                                    userId: metadata.user_id,
                                    artistId: metadata.artist_id!,
                                    fileKey: product.metadata.downloadable_asset!,
                                    receiptURL: charge.receipt_url || undefined
                                }
                            })
                        }
                        break
                }
            }
            break
        case 'invoice.paid':
            {
                // Get metadata
                const invoice = event.data.object
                const metadata = invoice.metadata as unknown as StripePaymentMetadata

                if (metadata.purchase_type == PurchaseType.CommissionInvoice) {
                    await prisma.formSubmission.update({
                        where: {
                            orderId: metadata.order_id
                        },
                        data: {
                            paymentStatus: PaymentStatus.Captured
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
