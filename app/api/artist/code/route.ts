import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { ArtistCodeResponse, StatusCode } from '@/helpers/api/request-inerfaces'

/**
 * Creates an artist code, adds it to the database, and returns it
 */
export async function GET() {
    let artistCode: string = 'NEMU-' + crypto.randomUUID()

    try {
        await prisma.aritstCode.create({
            data: {
                code: artistCode
            }
        })
    } catch (e) {
        console.log(e)
    }

    return NextResponse.json<ArtistCodeResponse>({
        status: StatusCode.Success,
        generated_code: artistCode
    })
}
