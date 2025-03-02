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

    const response = await fetch(get_ut_url(res.product.download.utKey))
    if (!response.ok) {
        console.error('Failed to fetch download', response)
        return new NextResponse('Failed to fetch download', { status: 500 })
    }

    const fileBody = response.body
    return new NextResponse(fileBody, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${res.product.download.filename}"`,
            'Content-Length': res.product.download.size.toString()
        }
    })
}
