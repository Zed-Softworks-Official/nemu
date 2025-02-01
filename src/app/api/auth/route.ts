import { Webhook } from 'svix'
import { headers } from 'next/headers'

import { type NextRequest, NextResponse } from 'next/server'
import { type WebhookEvent, type WebhookEventType } from '@clerk/nextjs/server'

import { env } from '~/env'

import { waitUntil } from '@vercel/functions'
import { tryCatch } from '~/lib/try-catch'
import { sync_clerk_data } from './sync'

const allowed_events = ['user.created', 'user.updated'] as WebhookEventType[]

async function process_event(event: WebhookEvent) {
    if (!allowed_events.includes(event.type)) return

    return sync_clerk_data(event)
}

export async function POST(req: NextRequest) {
    const headerPayload = await headers()
    const svix_id = headerPayload.get('svix-id')
    const svix_timestamp = headerPayload.get('svix-timestamp')
    const svix_signature = headerPayload.get('svix-signature')

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new NextResponse('Missing svix headers', { status: 400 })
    }

    const payload = (await req.json()) as unknown
    const body = JSON.stringify(payload)

    async function do_event_processing() {
        if (
            typeof svix_id !== 'string' ||
            typeof svix_timestamp !== 'string' ||
            typeof svix_signature !== 'string'
        ) {
            throw new Error('[CLERK HOOK]: Invalid svix headers')
        }

        const wh = new Webhook(env.CLERK_WEBHOOK_SECRET)
        const event = wh.verify(body, {
            'svix-id': svix_id,
            'svix-timestamp': svix_timestamp,
            'svix-signature': svix_signature
        }) as WebhookEvent

        waitUntil(process_event(event))
    }

    const { error } = await tryCatch(do_event_processing())

    if (error) {
        console.error('[CLERK HOOK]: Error processing event', error)
    }

    return NextResponse.json({ received: true })
}
