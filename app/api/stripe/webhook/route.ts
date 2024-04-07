import { NextResponse } from 'next/server'

import { StripeGetWebhookEvent as StripeStripeWebhookEvent } from '@/core/payments'
import { NemuResponse, StatusCode } from '@/core/responses'
import { prisma } from '@/lib/prisma'
import { PaymentStatus, PurchaseType, StripePaymentMetadata } from '@/core/structures'
import { UpdateCommissionAvailability } from '@/core/helpers'
import {
    CheckCreateSendbirdUser,
    CreateSendbirdMessageChannel
} from '@/core/server-helpers'
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
                    // Get the submission so we know the invoice id
                    const submission = await prisma.request.findFirst({
                        where: {
                            orderId: metadata.order_id
                        }
                    })

                    if (!submission) {
                        return
                    }

                    // Update the invoice in the database
                    const db_invoice = await prisma.invoice.findFirst({
                        where: {
                            stripeId: invoice.id,
                            userId: metadata.user_id,
                            submissionId: submission.id
                        }
                    })

                    await prisma.invoice.update({
                        where: {
                            id: db_invoice?.id
                        },
                        data: {
                            paymentStatus: PaymentStatus.Captured
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
                            subscriberId: metadata.user_id
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
