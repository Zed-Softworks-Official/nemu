import { prisma } from "@/prisma/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { code: string }}) {
    let result = await prisma.aritstCode.findFirst({
        where: {
            code: params.code
        }
    }) != null;

    return NextResponse.json({
        succuess: result
    });
}