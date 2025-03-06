import { waitUntil } from '@vercel/functions'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '~/env'
import { tryCatch } from '~/lib/try-catch'
import { redis } from '~/server/redis'
import { utapi } from '~/server/uploadthing'

async function processEvent(expired_images: string[], expired_downloads: string[]) {
    // Remove from redis
    const redis_promise = redis.zrem('product:images', ...expired_images)
    const redis_promise_2 = redis.zrem('product:downloads', ...expired_downloads)

    // Delete from uploadthing
    const ut_promise = utapi.deleteFiles([...expired_images, ...expired_downloads])

    await Promise.all([redis_promise, redis_promise_2, ut_promise])
}

export async function POST(req: NextRequest) {
    if (req.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const expiredImages = await redis.zrange<string[]>('product:images', 0, currentTime, {
        byScore: true
    })

    const expiredDownloads = await redis.zrange<string[]>(
        'product:downloads',
        0,
        currentTime,
        {
            byScore: true
        }
    )

    if (expiredImages.length === 0 && expiredDownloads.length === 0) {
        return NextResponse.json({ received: true })
    }

    const doEventProcessing = async () => {
        waitUntil(processEvent(expiredImages, expiredDownloads))
    }

    const { error } = await tryCatch(doEventProcessing())

    if (error) {
        console.error('[CRON]: Error processing event', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ received: true })
}
