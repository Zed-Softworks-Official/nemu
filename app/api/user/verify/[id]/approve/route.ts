import { PrismaCreate } from "@/prisma/prisma";
import { PrismaArtistInfo, PrismaModel } from "@/prisma/prisma-interface";
import { prisma } from "@/prisma/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { id: string }}) {

    // Get the artist from the verification section
    let verify_info = await prisma.artistVerification.findFirst({
        where: {
            auth0id: params.id
        }
    });

    // Create a new artist in the database
    // let artist_info: PrismaArtistInfo = {
    //     auth0id: params.id,
    //     stripeAccId: '',

    //     handle: verify_info!.requestedHandle,

    // }

    // Send the approved email

    return NextResponse.json({
        success: true
    });
}