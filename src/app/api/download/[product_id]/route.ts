import { getAuth } from '@clerk/nextjs/server'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { NextResponse, type NextRequest } from 'next/server'
import { get_ut_url } from '~/lib/utils'

import { db } from '~/server/db'
import { purchase } from '~/server/db/schema'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ product_id: string }> }
) {
    const auth = getAuth(req)
    if (!auth.userId) return redirect('/u/login')

    const { product_id } = await params

    // Verify purchase
    const res = await db.query.purchase.findFirst({
        where: and(
            eq(purchase.product_id, product_id),
            eq(purchase.user_id, auth.userId),
            eq(purchase.status, 'completed')
        ),
        with: {
            product: true
        }
    })

    if (!res) return notFound()

    try {
        // Fetch the file from uploadthing
        const response = await fetch(get_ut_url(res.product.download.utKey))

        if (!response.ok) {
            console.error(
                'Failed to fetch download',
                response.status,
                response.statusText
            )
            return new NextResponse('Failed to fetch download', { status: 500 })
        }

        // Ensure we have a readable stream
        if (!response.body) {
            console.error('Response body is null')
            return new NextResponse('Failed to fetch download', { status: 500 })
        }

        // Create a TransformStream to handle potential errors during streaming
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()

        // Pipe the response body to our transform stream
        response.body.pipeTo(writable).catch((error) => {
            console.error('Error streaming file:', error)
        })

        // Return a streaming response
        return new NextResponse(readable, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${res.product.download.filename}"`,
                'Content-Length': res.product.download.size.toString(),
                // Add cache headers to prevent re-downloading
                'Cache-Control': 'private, max-age=3600'
            }
        })
    } catch (error) {
        console.error('Error processing download request:', error)
        return new NextResponse('An error occurred while processing your download', {
            status: 500
        })
    }
}
