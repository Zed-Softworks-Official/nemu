import { prisma } from "@/prisma/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: {params: { id: string }}) {
    let artist = await prisma.artist.findFirst({
        where: {
            auth0id: params.id
        }
    });

    return NextResponse.json({
        info: artist
    });
}