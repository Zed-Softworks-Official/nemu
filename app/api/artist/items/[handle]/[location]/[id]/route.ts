import { prisma } from "@/lib/prisma";
import { PortfolioItem } from "@/helpers/api/request-inerfaces";
import { S3GetSignedURL, StringToAWSLocationsEnum } from "@/helpers/s3";

import { NextResponse } from "next/server";

//////////////////////////////////////////
// GET Item From AWS API Route
//////////////////////////////////////////
export async function GET(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
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
            name: portfolio[i].name,
            key: portfolio[i].image
        });
    }
    
    return NextResponse.json({portfolio_items: items});
}
