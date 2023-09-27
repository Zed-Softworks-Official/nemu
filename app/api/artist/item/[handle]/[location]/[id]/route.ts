import { PrismaClient } from "@prisma/client";
import { AWSLocations, S3Upload, StringToAWSLocationsEnum } from "@/helpers/s3";
import { PrismaCreate } from "@/prisma/prisma";
import { PrismaModel } from "@/prisma/prisma-interface";

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

    prisma.$disconnect();

    return S3Upload(params.handle, AWSLocations.Portfolio, file, params.id);
}