import { NextRequest, NextResponse } from 'next/server'

export default async function POST(req: NextRequest) {
    return NextResponse.error().json()
}