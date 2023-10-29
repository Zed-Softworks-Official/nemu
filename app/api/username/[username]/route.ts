import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { username: string }}) {
    let error = false
    let message = ''

    // Check if the user already exists
    const user = await prisma.user.findFirst({
        where: {
            name: params.username
        }
    })

    if (user) {
        error = true
        message = 'Looks like that username exists already!'
    }

    return NextResponse.json({
        error: error,
        message: message
    })
}

export async function POST(req: Request, { params }: { params: { username: string }}) {
    let error = false
    let message = ''

    const json = await req.json()
    
    try {
        await prisma.user.update({
            where: {
                id: json.current_user
            },
            data: {
                name: params.username
            }
        })
    } catch (e) {
        console.log(e)
        
        error = true
        message = 'Couldn\'t set username'
    }

    return NextResponse.json({
        error: error,
        message: message
    })
}