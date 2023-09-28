import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";


//////////////////////////////////////////
// POST Item To AWS API Route
//////////////////////////////////////////
export async function POST(req: Request, { params }: { params: { handle: string, location: string, id: string }}) {
    let data = await req.formData();
    //const file: File | null = data.get('dropzone-file') as unknown as File

    let prisma = new PrismaClient();

    let image = await prisma.portfolio.findFirst({
        where: {
            image: params.id
        } 
    });

    // prisma.$disconnect();

    return prisma.portfolio.update({
        where: {
            id: image!.id
        },
        data: {
            name: data.get('title') as string
        }
    });
}