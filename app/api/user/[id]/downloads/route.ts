import { NextResponse } from 'next/server'
import {
    DownloadData,
    DownloadsResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import { StripeGetStoreProductInfo } from '@/helpers/stripe'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const db_downloads = await prisma.purchased.findMany({
        where: {
            userId: params.id
        }
    })

    const downloads: DownloadData[] = []
    for (let i = 0; i < db_downloads.length; i++) {
        const product = await StripeGetStoreProductInfo(
            db_downloads[i].productId,
            db_downloads[i].stripeAccId,
            true
        )
        const artist = await prisma.artist.findFirst({
            where: {
                stripeAccId: db_downloads[i].stripeAccId
            }
        })

        downloads.push({
            name: product.name!,
            price: product.price,
            artist: artist?.handle!,
            url: product.asset!
        })
    }

    return NextResponse.json<DownloadsResponse>({
        status: StatusCode.Success,
        downloads: downloads
    })
}
