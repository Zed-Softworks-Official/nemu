import { CreateShopItemFromProducts } from "@/core/server-helpers";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, {params}: {params: {handle: string, slug: string}}) {

    const artist = await prisma.artist.findFirst({
        where: {
            handle: params.handle
        }
    })

    const db_product = await prisma.storeItem.findFirst({
        where: {
            artistId: artist?.id,
            slug: params.slug
        }
    })

    const product = await CreateShopItemFromProducts(db_product!, artist!)

    return NextResponse.json({
        title: product?.title,
        description: 'Some description',
        featured_image: product.featured_image
    })
} 