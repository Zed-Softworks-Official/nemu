import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { code: string }}) {
    const result = await prisma.aritstCode.findFirst({
        where: {
            code: params.code
        }
    }) != null;

    return NextResponse.json({
        success: result
    });
}