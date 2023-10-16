import NextAuth, { NextAuthOptions } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@next-auth/prisma-adapter'

import GoogleProvider from 'next-auth/providers/google'
import AppleProvider from 'next-auth/providers/apple'
import TwitterProvider from 'next-auth/providers/twitter'
import Credentials from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        Credentials({
            name: 'credentials',
            credentials: {
                username: { label: 'Username', type: 'text', placeholder: 'Username' },
                password: { label: 'Password', type: 'password', placeholder: 'Password' }
            },
            async authorize(credentials, req) {
                // 
                const res = await fetch('/api/user/auth', {
                    method: 'POST',
                    body: JSON.stringify(credentials),
                    headers: {
                        'content-type': 'application/json'
                    }
                });
                const user = await res.json();
                if (res.ok && user) {
                    return user;
                }

                return null;
            }
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        }),
        TwitterProvider({
            clientId: process.env.TWITTER_CLIENT_ID!,
            clientSecret: process.env.TWITTER_CLIENT_SECRET!
        }),
        AppleProvider({
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!
        })
    ]
}

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };