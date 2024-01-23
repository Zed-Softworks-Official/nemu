import NextAuth, { NextAuthOptions } from 'next-auth'

import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@next-auth/prisma-adapter'

import GoogleProvider from 'next-auth/providers/google'
import AppleProvider from 'next-auth/providers/apple'
import TwitterProvider from 'next-auth/providers/twitter'
import EmailProvider from 'next-auth/providers/email'
import { Role } from '@/core/structures'

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    session: {
        strategy: 'jwt'
    },
    pages: {
        signIn: '/u/login',
        verifyRequest: '/u/verify-request',
        newUser: '/u/new-user'
    },
    providers: [
        EmailProvider({
            server: {
                host: process.env.EMAIL_SERVER_HOST,
                port: process.env.EMAIL_SERVER_PORT,
                auth: {
                    user: process.env.EMAIL_SERVER_USER,
                    pass: process.env.EMAIL_SERVER_PASSWORD
                }
            },
            from: process.env.EMAIL_FROM
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        }),
        TwitterProvider({
            clientId: process.env.TWITTER_CLIENT_ID!,
            clientSecret: process.env.TWITTER_CLIENT_SECRET!,
            version: '2.0'
        }),
        AppleProvider({
            clientId: process.env.APPLE_CLIENT_ID!,
            clientSecret: process.env.APPLE_CLIENT_SECRET!
        })
    ],
    callbacks: {
        async jwt({ token, user, account }) {
            if (account && user) {
                token.provider = account.provider
            }

            return token
        },
        async session({ session, token }) {
            try {
                // Get User Role
                const db_user = await prisma.user.findFirst({
                    where: {
                        id: token.sub
                    }
                })

                // Add Extra Session Data
                session.user.user_id = token.sub
                session.user.provider = token.provider
                    ? (token.provider as string)
                    : undefined
                session.user.role = db_user?.role as Role

                // If the user's role is an artist we need some additional information
                if (db_user?.role) {
                    switch (db_user?.role as Role) {
                        case Role.Artist:
                            {
                                const db_artist = await prisma.artist.findFirst({
                                    where: {
                                        userId: db_user?.id
                                    }
                                })
                                session.user.handle = db_artist?.handle
                            }
                            break
                    }
                }
            } catch (e) {
                console.log(e)
            }

            return session
        }
    }
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
