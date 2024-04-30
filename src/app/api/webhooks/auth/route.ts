import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { env } from '~/env'
import { PublicUserMetadata, UserRole } from '~/core/structures'

export async function POST(req: Request) {
    // Get the headers
    const headersPayload = headers()
    const svix_id = headersPayload.get('svix-id')
    const svix_timestamp = headersPayload.get('svix-timestamp')
    const svix_signature = headersPayload.get('svix-signature')

    // If there are no headers throw an error
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response('Missing headers', { status: 400 })
    }

    // Get Body
    const payload = await req.json()
    const body = JSON.stringify(payload)

    // Create a new svix instance with your secret
    const wh = new Webhook(env.WEBHOOK_SECRET)

    let event: WebhookEvent

    // Verify the payload with headers
    try {
        event = wh.verify(body, {
            'svix-id': svix_id,
            'svix-signature': svix_signature,
            'svix-timestamp': svix_timestamp
        }) as WebhookEvent
    } catch (e) {
        console.error(e)
        return new Response('An Error Occured', { status: 400 })
    }

    // Get the ID and the type of the event
    const { id } = event.data

    switch (event.type) {
        case 'user.created':
            {
                // Add metadata to the user
                const publicMetadata: PublicUserMetadata = {
                    role: UserRole.Standard,
                    has_sendbird_account: false
                }

                return new Response('User Created', { status: 200 })
            }
            break
        case 'user.updated':
            {
                return new Response('User Updated', { status: 200 })
            }
            break
        case 'user.deleted':
            {
                return new Response('User Deleted', { status: 200 })
            }
            break
    }

    return new Response('Unhandled Event', { status: 400 })
}
