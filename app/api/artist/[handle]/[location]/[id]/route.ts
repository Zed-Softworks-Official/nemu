import { NextResponse } from "next/server";

import { PrismaClient } from "@prisma/client";
import { PortfolioItem } from "@/helpers/portfolio";
import { S3GetSignedURL, StringToAWSLocationsEnum } from "@/helpers/s3";

export async function GET(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    let prisma = new PrismaClient();

    let portfolio = await prisma.portfolio.findMany({
        where: {
            auth0id: params.id
        }
    });

    let items: PortfolioItem[] = [];
    for (let i = 0; i < portfolio.length; i++) {
        let url = await S3GetSignedURL(params.handle, StringToAWSLocationsEnum(params.location), portfolio[i].image);
        items.push({
            signed_url: url,
            name: portfolio[i].name
        });
    }

    prisma.$disconnect();
    
    return NextResponse.json({portfolio_items: items});
}