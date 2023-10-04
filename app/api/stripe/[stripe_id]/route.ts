import { NextResponse } from "next/server";


export async function GET(req: Request, { params }: { params: { stripe_id: string }}) {
    return NextResponse.json({
        success: true
    });
}