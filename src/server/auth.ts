import { PrismaAdapter } from '@auth/prisma-adapter'
import { getServerSession, type DefaultSession, type NextAuthOptions } from 'next-auth'
import { type Adapter } from 'next-auth/adapters'

import DiscordProvider from 'next-auth/providers/discord'
import GoogleProvider from 'next-auth/providers/google'
import TwitterProvider from 'next-auth/providers/twitter'
import EmailProvider from 'next-auth/providers/email'

import { env } from '~/env'
import { db } from '~/server/db'

import { UserRole } from '~/core/structures'
import { AsRedisKey, cache } from '~/server/cache'

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module 'next-auth' {
    interface Session extends DefaultSession {
        user: {
            id: string
            role: UserRole

            handle?: string
            artist_id?: string
        } & DefaultSession['user']
    }

    interface User {
        // ...other properties
        role: UserRole

        handle?: string
        artist_id?: string
    }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
    secret: env.NEXTAUTH_SECRET,
    pages: {
        signIn: '/u/login',
        verifyRequest: '/u/verify-request',
        newUser: '/u/new-user'
    },
    callbacks: {
        session: async ({ session, user }) => {
            const cachedUser = await cache.get(AsRedisKey('users', user.id))

            if (cachedUser) {
                const user_data = JSON.parse(cachedUser)

                if (user.image) {
                    user.image = user_data.user.image
                }
            }

            if (user.role === UserRole.Artist) {
                const artist = await db.artist.findFirst({
                    where: {
                        userId: user.id
                    }
                })

                user.artist_id = artist!.id
                user.handle = artist!.handle
            }

            return { ...session, user }
        }
    },
    adapter: PrismaAdapter(db) as Adapter,
    providers: [
        DiscordProvider({
            clientId: env.DISCORD_CLIENT_ID,
            clientSecret: env.DISCORD_CLIENT_SECRET
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
        })
    ]
}

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions)
