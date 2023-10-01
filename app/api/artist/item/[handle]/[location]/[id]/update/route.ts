import { S3Delete, S3Upload, StringToAWSLocationsEnum } from "@/helpers/s3";
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";


//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    let data = await req.formData();
    const file: File | null = data.get('dropzone-file') as unknown as File

    let prisma = new PrismaClient();

    let image = await prisma.portfolio.findFirst({
        where: {
            image: params.id
        } 
    });

    await S3Delete(params.handle, StringToAWSLocationsEnum(params.location), params.id);
    let title: string;
    if (data.get('title') != '') {
        title = data.get('title') as string;
    } else {
        title = image?.name!
    }

    await prisma.portfolio.update({
        where: {
            id: image!.id
        },
        data: {
            name: title
        }
    });

    prisma.$disconnect();

    if (file != null) {
        return S3Upload(params.handle, StringToAWSLocationsEnum(params.location), file, params.id);
    }

    return NextResponse.json({success: true});
}