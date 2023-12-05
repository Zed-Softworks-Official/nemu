import { ShopResponse, StatusCode } from "@/helpers/api/request-inerfaces";
import { StripeGetStoreProductInfo } from "@/helpers/stripe";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, {params}: {params: {id: string, slug: string}}) {
    const db_product = await prisma.storeItem.findFirst({
        where: {
            handle: params.id,
            slug: params.slug
        }
    })

    return NextResponse.json<ShopResponse>({
        status: StatusCode.Success,
        product: await StripeGetStoreProductInfo(db_product?.id!, db_product?.stripeAccId!)
    })
}