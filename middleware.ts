import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'


export function middleware(request: NextRequest) {
    NextResponse.next();
}

export const config = {
    matcher: ['/', '/:handle']
}