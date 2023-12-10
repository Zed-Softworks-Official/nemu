import { NextResponse } from 'next/server'
import {
    DownloadData,
    DownloadsResponse,
    StatusCode
} from '@/helpers/api/request-inerfaces'
import { prisma } from '@/lib/prisma'
import { StripeGetStoreProductInfo } from '@/helpers/stripe'

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const user = await prisma.user.findFirst({
        where: {
            id: params.id
        },
        include: {
            purchased: true
        }
    })

    const downloads: DownloadData[] = []
    if (user?.purchased) {
        for (let i = 0; i < user?.purchased.length; i++) {
            if (!user.purchased[i].complete) {
                break
            }

            const product = await StripeGetStoreProductInfo(
                user?.purchased[i].productId,
                user?.purchased[i].stripeAccId,
                true
            )

            const artist = await prisma.artist.findFirst({
                where: {
                    stripeAccId: user.purchased[i].stripeAccId
                }
            })

            downloads.push({
                name: product.name!,
                price: product.price,
                artist: artist?.handle!,
                url: product.asset!
            })
        }
    }

    return NextResponse.json<DownloadsResponse>({
        status: StatusCode.Success,
        downloads: downloads
    })
}
