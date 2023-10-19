import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

import * as z from 'zod'

const userSchema = z.object({
    username: z.string().min(1, 'Username is required').max(100),
    email: z.string().min(1, 'Email is required').email('Invalid Email'),
    password: z.string().min(1, 'Password is required').min(8, 'Password must have at least 8 characters')
})

export async function POST(req: Request) {
    
}