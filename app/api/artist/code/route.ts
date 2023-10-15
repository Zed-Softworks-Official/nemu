import { prisma } from "@/prisma/prisma";
import { NextResponse } from "next/server";


/**
 * Creates an artist code, adds it to the database, and returns it
 */
export async function GET() {
    let artistCode: string = 'NEMU-' + crypto.randomUUID();

    try {
        await prisma.aritstCode.create({
            data: {
                code: artistCode
            }
        });

    } catch (e) {
        console.log(e);
    }

    return NextResponse.json({
        gerneated_code: artistCode
    });
}