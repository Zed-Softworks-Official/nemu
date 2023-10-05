import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { id: string }}) {
    let prisma = new PrismaClient();

    // Delete User from database
    await prisma.artistVerification.delete({
        where: {
            auth0id: params.id
        }
    });

    // TODO: Send a rejection email

    return NextResponse.json({
        success: true
    });
}