import { NextResponse } from "next/server";

import { PrismaClient } from "@prisma/client";
import { PortfolioItem } from "@/helpers/portfolio";
import { AWSLocations, S3GetSignedURL } from "@/helpers/s3";

export async function GET(req: Request, { params }: { params: { handle: string, id: string }}) {
    let prisma = new PrismaClient();

    let portfolio = await prisma.portfolio.findMany({
        where: {
            auth0id: params.id
        }
    });

    let items: PortfolioItem[] = [];
    for (let i = 0; i < portfolio.length; i++) {
        let url = await S3GetSignedURL(params.handle, AWSLocations.Portfolio, portfolio[i].image);
        items.push({
            signed_url: url,
            name: portfolio[i].name
        });
    }
    
    return NextResponse.json({portfolio_items: items});
}