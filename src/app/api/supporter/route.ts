import { getAuth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'

export function GET(req: NextRequest) {
    // Get user from session
    const user = getAuth(req)

    // Generate the stripe checkout session

    return NextResponse.json({ userId: user.userId })
}
