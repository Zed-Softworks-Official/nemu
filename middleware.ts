import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { NemuPrismaClient, InitializeNemuClient } from '@/prisma/prisma'

export function middleware(request: NextRequest) {
    if (!NemuPrismaClient) {
        //InitializeNemuClient();
    }

    NextResponse.next();
}

export const config = {
    matcher: ['/', '/:handle']
}