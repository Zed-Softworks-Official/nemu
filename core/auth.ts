import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { DefaultSession, getServerSession, NextAuthOptions } from 'next-auth'

import GoogleProvider from 'next-auth/providers/google'
import TwitterProvider from 'next-auth/providers/twitter'
import EmailProvider from 'next-auth/providers/email'
import DiscordProvider from 'next-auth/providers/discord'

import { Role } from './structures'
import { redis } from '@/lib/redis'
import { AsRedisKey } from './helpers'
import { env } from '@/env'

/**
 * Extend Next Auth Types
 */
declare module 'next-auth' {
    interface Session {
        user: {
            id: string
            role: Role

            handle?: string
            artist_id?: string
        } & DefaultSession['user']
    }

    interface User {
        role: Role
        // provider: string

        handle?: string
        artist_id?: string
    }
}

/**
 * Auth options to configure NextAuth
 */
export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    pages: {
        signIn: '/u/login',
        verifyRequest: '/u/verify-request',
        newUser: '/u/new-user'
    },
    providers: [
        EmailProvider({
            server: {
                host: env.EMAIL_SERVER_HOST,
                port: env.EMAIL_SERVER_PORT,
                auth: {
                    user: env.EMAIL_SERVER_USER,
                    pass: env.EMAIL_SERVER_PASSWORD
                }
            },
            from: env.EMAIL_FROM
        }),
        GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET
        }),
        TwitterProvider({
            clientId: env.TWITTER_CLIENT_ID,
            clientSecret: env.TWITTER_CLIENT_SECRET,
            version: '2.0'
        }),
        DiscordProvider({
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET
        })
    ],
    callbacks: {
        session: async ({ session, user, trigger }) => {
            const cachedUser = await redis.get(AsRedisKey('users', user.id))

            if (cachedUser) {
                const user_data = JSON.parse(cachedUser)

                if (user.image) {
                    user.image = user_data.user.image
                }
            }

            if (trigger !== 'update') {
                if (user.role === Role.Artist) {
                    const artist = await prisma.artist.findFirst({
                        where: {
                            userId: user.id
                        }
                    })

                    session.user.artist_id = artist?.id
                    session.user.handle = artist?.handle
                }
            }

            return { ...session, user }
        }
    }
}

/**
 * Wrapper so we don't need to include auth options all the time
 */
export const getServerAuthSession = () => getServerSession(authOptions)
