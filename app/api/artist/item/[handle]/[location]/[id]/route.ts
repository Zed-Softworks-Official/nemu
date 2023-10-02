import { NextResponse } from "next/server";
import { S3Upload, StringToAWSLocationsEnum } from "@/helpers/s3";

import { PrismaClient } from "@prisma/client";
import { PrismaCreate } from "@/prisma/prisma";
import { PrismaModel, StringToPrismaModelEnum } from "@/prisma/prisma-interface";
import { RequestItem } from "@/helpers/api/request-item";


/**
 * GET Method for API for a SINGLE item
 * 
 * Gets the requeted item from S3 and our database
 */
export async function GET(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    ////////////////////////////
    // Determine where the
    // object is and retrieve it
    ////////////////////////////
    let item = await RequestItem(params.handle, params.location, params.id);

    // Return item data
    return NextResponse.json({
        item: item
    });
}


/**
 * POST Method for API for a SINGLE item
 * 
 * Creates the requested item in S3 and our Database
 */
export async function POST(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    ////////////////////////////
    // Get Form Data
    ////////////////////////////
    let data = await req.formData();
    const file: File | null = data.get('dropzone-file') as unknown as File
    
    ////////////////////////////
    // Get Artist Information
    ////////////////////////////
    let prisma = new PrismaClient();
    let artist = await prisma.artist.findFirst({
        where: {
            handle: params.handle
        } 
    });

    ////////////////////////////
    // Check for Prisma Model
    ////////////////////////////
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