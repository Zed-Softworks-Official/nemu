import { PrismaClient } from "@prisma/client";
import { S3GetSignedURL, S3Upload, StringToAWSLocationsEnum } from "@/helpers/s3";
import { PrismaCreate } from "@/prisma/prisma";
import { PrismaModel, StringToPrismaModelEnum } from "@/prisma/prisma-interface";
import { NextResponse } from "next/server";
import { PortfolioItem } from "@/helpers/api/request-inerfaces";


//////////////////////////////////////////
// POST Item To AWS API Route
//
// Get Item
//////////////////////////////////////////
export async function GET(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    let prisma = new PrismaClient();
    let item = await prisma.portfolio.findFirst({
        where: {
            image: params.id
        }
    });

    let portfolio_item: PortfolioItem = {
        name: item!.name,
        signed_url: await S3GetSignedURL(params.handle, StringToAWSLocationsEnum(params.location), params.id),
        key: params.id
    }

    prisma.$disconnect();

    return NextResponse.json({
        item: portfolio_item
    });
}

//////////////////////////////////////////
// POST Item To AWS API Route
//
// Create Item
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

    // Determine whether we should and where to create the new Item in our database
    switch (StringToPrismaModelEnum(params.location)) {
        case PrismaModel.Portfolio:
            await PrismaCreate(PrismaModel.Portfolio, {
                auth0id: artist!.auth0id,
                image: params.id,
                name: data.get('title')!.toString()
            });
            break;
        case PrismaModel.Store:

            break;
        default:
            break;
    }

    // Disconnect Prisma
    prisma.$disconnect();
    
    // Return the promise for the uploading file
    return S3Upload(params.handle, StringToAWSLocationsEnum(params.location), file, params.id);
}