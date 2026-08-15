import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { getTlsHttp, registerHttp } from './controllers'

const http = httpRouter()

http.route({
    path: '/controllers/register',
    method: 'POST',
    handler: registerHttp,
})

http.route({
    path: '/controllers/tls',
    method: 'POST',
    handler: getTlsHttp,
})

function jsonError(status: number, error: string): Response {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

function authorizeController(body: {
    registrationSecret?: string
}): Response | null {
    const expected = process.env.CONTROLLER_REGISTRATION_SECRET
    if (expected && body.registrationSecret !== expected) {
        return jsonError(401, 'Unauthorized')
    }
    return null
}

export const relayPendingHttp = httpAction(async (ctx, req) => {
    let body: {
        controllerId?: string
        registrationSecret?: string
    }
    try {
        body = await req.json()
    } catch {
        return jsonError(400, 'Invalid JSON')
    }

    const authError = authorizeController(body)
    if (authError) return authError

    if (!body.controllerId) {
        return jsonError(400, 'controllerId is required')
    }

    const exists = await ctx.runQuery(internal.relay.controllerExists, {
        controllerId: body.controllerId,
    })
    if (!exists) {
        return jsonError(404, 'Controller not found')
    }

    const messages = await ctx.runQuery(internal.relay.pendingForController, {
        controllerId: body.controllerId,
    })

    return new Response(
        JSON.stringify({
            messages: messages.map((message) => ({
                requestId: message.requestId,
                payload: message.payload,
            })),
        }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }
    )
})

export const relayRespondHttp = httpAction(async (ctx, req) => {
    let body: {
        controllerId?: string
        requestId?: string
        payload?: string
        registrationSecret?: string
    }
    try {
        body = await req.json()
    } catch {
        return jsonError(400, 'Invalid JSON')
    }

    const authError = authorizeController(body)
    if (authError) return authError

    if (!body.controllerId || !body.requestId || !body.payload) {
        return jsonError(
            400,
            'controllerId, requestId, and payload are required'
        )
    }

    try {
        const id = await ctx.runMutation(internal.relay.respondInternal, {
            controllerId: body.controllerId,
            requestId: body.requestId,
            payload: body.payload,
        })
        return new Response(JSON.stringify({ ok: true, id }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to respond'
        if (message === 'Controller not found') {
            return jsonError(404, message)
        }
        return jsonError(500, message)
    }
})

http.route({
    path: '/relay/pending',
    method: 'POST',
    handler: relayPendingHttp,
})

http.route({
    path: '/relay/respond',
    method: 'POST',
    handler: relayRespondHttp,
})

export default http
