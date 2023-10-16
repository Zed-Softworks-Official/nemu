import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { hash } from 'bcrypt'

import * as z from 'zod'

const userSchema = z.object({
    username: z.string().min(1, 'Username is required').max(100),
    email: z.string().min(1, 'Email is required').email('Invalid Email'),
    password: z.string().min(1, 'Password is required').min(8, 'Password must have at least 8 characters')
})

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { email, username, password }: { email: string, username: string, password: string } = userSchema.parse(body)

        // Check if the email already exists
        const existingUserByEmail = await prisma.user.findUnique({
            where: {
                email: email
            }
        })

        if (existingUserByEmail) {
            return NextResponse.json({
                user: null,
                message: 'User with this email already exists!'
            }, { status: 409 })
        }

        // Check if the username already exists
        const existingUserByUsername = await prisma.user.findUnique({
            where: {
                name: username
            }
        })

        if (existingUserByUsername) {
            return NextResponse.json({
                user: null,
                message: 'User with this username already exists!'
            }, { status: 409 })
        }

        // Hash Password
        const hashedPassword = await hash(password, 10)

        // Create New User
        const newUser = await prisma.user.create({
            data: {
                name: username,
                email: email,
                password: hashedPassword
            }
        })

        const { password: newUserPassword, ...rest } = newUser

        return NextResponse.json({ 
            user: rest,
            message: 'User created!'
        }, { status: 200 })

    } catch (e) {
        return NextResponse.json({
            message: 'An error occured',
            error: e
        }, { status: 500})

    }
}