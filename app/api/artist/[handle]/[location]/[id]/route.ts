import { NextResponse } from "next/server";

import { PrismaClient } from "@prisma/client";
import { PortfolioItem } from "@/helpers/portfolio";
import { AWSLocations, S3GetSignedURL, S3Upload, StringToAWSLocationsEnum } from "@/helpers/s3";
import { PrismaCreate } from "@/prisma/prisma";
import { PrismaModel } from "@/prisma/prisma-interface";


//////////////////////////////////////////
// GET Item From AWS API Route
//////////////////////////////////////////
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


//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    let data = await req.formData();
    const file: File | null = data.get('dropzone-file') as unknown as File

    let prisma = new PrismaClient();
    let artist = await prisma.artist.findFirst({
        where: {
            handle: params.handle
        } 
    });

    await PrismaCreate(PrismaModel.Portfolio, {
        auth0id: artist!.auth0id,
        image: params.id,
        name: data.get('title')!.toString()
    });

    return S3Upload(params.handle, AWSLocations.Portfolio, file, params.id);
}