import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: {params: { id: string }}) {
    let prisma = new PrismaClient();
    let artist = await prisma.artist.findFirst({
        where: {
            auth0id: params.id
        }
    });

    return NextResponse.json({
        info: artist
    });
}