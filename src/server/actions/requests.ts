'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { revalidateTag } from 'next/cache'
import { eq, and, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

import { env } from '~/env'
import * as sendbird from '~/server/sendbird'

import { RequestStatus, InvoiceStatus, type KanbanContainerData } from '~/core/structures'
import { update_commission_check_waitlist } from '~/lib/server-utils'
import { StripeCreateCustomer, StripeCreateInvoice } from '~/core/payments'

import { db } from '~/server/db'
import {
    commissions,
    requests,
    stripe_customer_ids,
    invoices,
    invoice_items,
    kanbans
} from '~/server/db/schema'
import { knock, KnockWorkflows } from '~/server/knock'
import { verify_auth } from '~/server/actions/auth'

/**
 * Submits a request to the given commission
 *
 * @param {string} form_id - The id of the form to submit the request to
 * @param {string} commission_id - The id of the commission to submit the request to
 * @param {string} content - The content of the request
 */
export async function set_request(
    form_id: string,
    commission_id: string,
    content: string
) {
    const auth_data = await verify_auth()
    if (!auth_data) return { success: false }

    // Get commission data
    let commission
    try {
        commission = await db.query.commissions.findFirst({
            where: eq(commissions.id, commission_id),
            with: {
                artist: true
            }
        })
    } catch (e) {
        console.error('Failed to get commission: ', e)
        return { success: false }
    }

    if (!commission) {
        console.error('Commission not found')
        return { success: false }
    }

    // Retrieve and update the commission availability
    const waitlisted = await update_commission_check_waitlist(commission)

    // Create the request
    try {
        await db.insert(requests).values({
            id: createId(),
            form_id,
            user_id: auth_data.user.id,
            status: waitlisted ? RequestStatus.Waitlist : RequestStatus.Pending,
            commission_id,
            order_id: crypto.randomUUID(),
            content: JSON.parse(content)
        })
    } catch (e) {
        console.error('Failed to create request: ', e)
        return { success: false }
    }

    // Notify the user of the request
    await knock.workflows.trigger(KnockWorkflows.CommissionRequestUserEnd, {
        recipients: [auth_data.user.id],
        data: {
            commission_title: commission.title,
            artist_handle: commission.artist.handle
        }
    })

    // Notify the artist of a new request
    await knock.workflows.trigger(KnockWorkflows.CommissionRequestArtistEnd, {
        recipients: [commission.artist.user_id],
        data: {
            commission_title: commission.title,
            commission_requests_url:
                env.BASE_URL + '/dashboard/commissions/' + commission.slug
        }
    })

    // Invalidate cache
    revalidateTag('commission_requests')
    revalidateTag('requests')

    return { success: true }
}

export async function determine_request(request_id: string, accepted: boolean) {
    const auth_data = await verify_auth()
    if (!auth_data) return { success: false }

    // Get the request
    let request
    try {
        request = await db.query.requests.findFirst({
            where: eq(requests.id, request_id),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })
    } catch (e) {
        console.error('Failed to get request: ', e)
        return { success: false }
    }

    if (!request) {
        console.error('Request not found')
        return { success: false }
    }

    // Get Stripe customer id
    let customer_id
    try {
        customer_id = await db.query.stripe_customer_ids.findFirst({
            where: and(
                eq(stripe_customer_ids.user_id, request.user_id),
                eq(stripe_customer_ids.artist_id, request.commission.artist_id)
            )
        })
    } catch (e) {
        console.error('Failed to get customer id: ', e)
        return { success: false }
    }

    // If the stripe account does not exist, create one
    if (!customer_id) {
        const request_user = auth_data.user

        // Create customer account in stripe
        const customer = await StripeCreateCustomer(
            request.commission.artist.stripe_account,
            request_user.username ?? request_user.firstName ?? undefined,
            request_user.emailAddresses[0]?.emailAddress ?? undefined
        )

        if (!customer) {
            console.error('Failed to create customer')
            return { success: false }
        }

        // Save the customer id in the database
        const generated_customer_id = createId()
        await db.insert(stripe_customer_ids).values({
            id: generated_customer_id,
            user_id: request.user_id,
            artist_id: request.commission.artist_id,
            customer_id: customer.id,
            stripe_account: request.commission.artist.stripe_account
        })

        customer_id = await db.query.stripe_customer_ids.findFirst({
            where: eq(stripe_customer_ids.id, generated_customer_id)
        })

        if (!customer_id) {
            console.error('Failed to create customer id')
            return { success: false }
        }
    }

    // Update commission stats based on acceptance or rejection
    const increase_amount = accepted ? 1 : 0
    const decrease_amount = !accepted ? 1 : 0
    try {
        await db
            .update(commissions)
            .set({
                new_requests: sql`${commissions.new_requests} + ${increase_amount}`,
                accepted_requests: sql`${commissions.accepted_requests} + ${increase_amount}`,
                rejected_requests: sql`${commissions.rejected_requests} + ${decrease_amount}`
            })
            .where(eq(commissions.id, request.commission_id))
    } catch (e) {
        console.error('Failed to update commission stats: ', e)
        return { success: false }
    }

    // Notify the user of the decision
    await knock.workflows.trigger(KnockWorkflows.CommissionDetermineRequest, {
        recipients: [request.user_id],
        data: {
            commission_title: request.commission.title,
            artist_handle: request.commission.artist.handle,
            status: accepted ? 'accepted' : 'rejected'
        }
    })

    // If rejected, Update the request to reflect the rejection and return
    if (!accepted) {
        try {
            await db
                .update(requests)
                .set({
                    status: RequestStatus.Rejected
                })
                .where(eq(requests.id, request.id))

            return { success: true }
        } catch (e) {
            console.error('Failed to update request: ', e)
            return { success: false }
        }
    }

    // If accepted, Create a stripe invoice draft
    const generated_invoice_id = createId()
    const stripe_draft = await StripeCreateInvoice(customer_id.stripe_account, {
        customer_id: customer_id.customer_id,
        user_id: request.user_id,
        commission_id: request.commission_id,
        order_id: request.order_id,
        invoice_id: generated_invoice_id
    })

    // Create the invoice object in the database with the initial item
    try {
        await db.insert(invoices).values({
            id: generated_invoice_id,
            stripe_id: stripe_draft.id,
            customer_id: customer_id.customer_id,
            stripe_account: customer_id.stripe_account,
            user_id: customer_id.user_id,
            artist_id: request.commission.artist_id,
            status: InvoiceStatus.Creating,
            request_id: request.id,
            total: request.commission.price
        })
    } catch (e) {
        console.error('Failed to create invoice: ', e)
        return { success: false }
    }

    // Create invoice items
    try {
        await db.insert(invoice_items).values({
            id: createId(),
            invoice_id: generated_invoice_id,
            name: request.commission.title,
            price: request.commission.price,
            quantity: 1
        })
    } catch (e) {
        console.error('Failed to create invoice item: ', e)
        return { success: false }
    }

    // Create a sendbird user if they don't exist
    const clerk_client = await clerkClient()
    if (!auth_data.user.publicMetadata.has_sendbird_account) {
        await sendbird.create_user({
            user_id: auth_data.user.id,
            nickname: auth_data.user.username ?? 'User',
            profile_url: auth_data.user.imageUrl
        })

        await clerk_client.users.updateUserMetadata(auth_data.user.id, {
            publicMetadata: {
                has_sendbird_account: true
            }
        })
    }

    // Create a sendbird user if they don't exist
    if (!auth_data.user.publicMetadata.has_sendbird_account) {
        await sendbird.create_user({
            user_id: auth_data.user.id,
            nickname: auth_data.user.username ?? 'User',
            profile_url: auth_data.user.imageUrl
        })

        await clerk_client.users.updateUserMetadata(auth_data.user.id, {
            publicMetadata: {
                has_sendbird_account: true
            }
        })
    }

    // Create a sendbird channel
    await sendbird.create_channel({
        users_ids: [auth_data.user.id, request.commission.artist.user_id],
        name: `${request.commission.title} - ${auth_data.user.username}`,
        cover_url: request.commission.images[0]?.url ?? env.BASE_URL + '/profile.png',
        channel_url: request.order_id,
        operator_ids: [request.commission.artist.user_id],
        block_sdk_user_channel_join: true,
        is_distinct: false,
        data: JSON.stringify({
            artist_id: request.commission.artist_id,
            commission_title: request.commission.title
        })
    })

    // Create default containers for kanban
    const containers: KanbanContainerData[] = [
        {
            id: crypto.randomUUID(),
            title: 'Todo'
        },
        {
            id: crypto.randomUUID(),
            title: 'In Progress'
        },
        {
            id: crypto.randomUUID(),
            title: 'Done'
        }
    ]

    const kanban_id = createId()
    await db.insert(kanbans).values({
        id: kanban_id,
        request_id: request.id,
        containers: containers
    })

    const kanban = await db.query.kanbans.findFirst({
        where: eq(kanbans.id, kanban_id)
    })

    if (!kanban) {
        console.error('Kanban not found')
        return { success: false }
    }

    // Update the request to reflect the acceptance
    await db
        .update(requests)
        .set({
            status: RequestStatus.Accepted,
            invoice_id: generated_invoice_id,
            kanban_id: kanban.id,
            sendbird_channel_url: request.order_id
        })
        .where(eq(requests.id, request.id))

    // Invalidate Cache
    revalidateTag('commission_requests')

    return { success: true }
}
