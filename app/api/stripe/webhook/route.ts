import { NextResponse } from 'next/server'

import { StripeGetWebhookEvent as StripeStripeWebhookEvent } from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { PaymentStatus, PurchaseType, StripePaymentMetadata } from '@/core/structures'
import { UpdateCommissionAvailability } from '@/core/helpers'
import { CheckCreateSendbirdUser, CreateSendbirdMessageChannel } from '@/core/server-helpers'
import { novu } from '@/lib/novu'

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
                    // Payment for Artist Corner Items
                    ////////////////////////////////////////////////////////////
                    case PurchaseType.ArtistCorner:
                        {
                            const product = await prisma.product.findFirst({
                                where: {
                                    id: metadata.product_id,
                                    artistId: metadata.artist_id
                                }
                            })

                            await prisma.downloads.create({
                                data: {
                                    userId: metadata.user_id,
                                    artistId: metadata.artist_id!,
                                    fileKey: product?.downloadableAsset!,
                                    receiptURL: charge.receipt_url || undefined,
                                    productId: product?.id
                                }
                            })

                            // Notify artist of purchase
                            const artist = await prisma.artist.findFirst({
                                where: {
                                    id: metadata.artist_id
                                }
                            })

                            novu.trigger('artist-corner-purchase', {
                                to: {
                                    subscriberId: artist?.userId!
                                },
                                payload: {
                                    product_name: product?.title
                                }
                            })

                            // Notify User that download is ready
                            novu.trigger('downloads-available', {
                                to: {
                                    subscriberId: metadata.user_id
                                },
                                payload: {
                                    item_name: product?.title,
                                    artist_handle: artist?.handle
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
                    const updated_submission = await prisma.formSubmission.update({
                        where: {
                            orderId: metadata.order_id
                        },
                        data: {
                            paymentStatus: PaymentStatus.Captured
                        },
                        include: {
                            form: {
                                include: {
                                    commission: {
                                        include: {
                                            artist: true
                                        }
                                    }
                                }
                            }
                        }
                    })

                    // Notify Artist that invoice has been paid
                    const user = await prisma.user.findFirst({
                        where: {
                            id: metadata.user_id
                        }
                    })

                    novu.trigger('invoices', {
                        to: {
                            subscriberId: updated_submission.form.commission?.artist.userId!
                        },
                        payload: {
                            status: 'paid',
                            username: user?.name!
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
