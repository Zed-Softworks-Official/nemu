import NextAuth, { getServerSession, NextAuthOptions } from 'next-auth'

import { prisma } from '@/lib/prisma'
import { PrismaAdapter } from '@next-auth/prisma-adapter'

import GoogleProvider from 'next-auth/providers/google'
import AppleProvider from 'next-auth/providers/apple'
import TwitterProvider from 'next-auth/providers/twitter'
import EmailProvider from 'next-auth/providers/email'
import DiscordProvider from 'next-auth/providers/discord'
import { AWSLocations, Role } from '@/core/structures'

import { redis } from '@/lib/redis'
import { Artist, User } from '@prisma/client'
import { AsRedisKey } from '@/core/helpers'
import { S3GetSignedURL } from '@/core/storage'

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
        DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET
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
            const cachedUser = await redis.get(AsRedisKey('users', token.sub!))

            let user_data: { user: User | null; artist: Artist | null } = {
                user: null,
                artist: null
            }

            if (cachedUser) {
                user_data = JSON.parse(cachedUser)
            }

            // Set the cached user if we don't have one
            if (!cachedUser) {
                const user = await prisma.user.findFirst({
                    where: {
                        id: token.sub
                    }
                })

                if (user?.role === Role.Artist) {
                    const artist = await prisma.artist.findFirst({
                        where: {
                            userId: user.id
                        }
                    })

                    user_data.artist = artist
                }

                // Fetch User Image if they have a key instead of a url
                if (user?.image && !user.image.includes('http')) {
                    user.image = await S3GetSignedURL(
                        user_data.artist ? user_data.artist.id : user.id,
                        AWSLocations.Profile,
                        user?.image!
                    )
                }

                user_data.user = user

                await redis.set(
                    AsRedisKey('users', token.sub!),
                    JSON.stringify(user_data),
                    'EX',
                    3600
                )
            }

            // Set Extra Session Variables
            session.user.user_id = token.sub
            session.user.provider = token.provider
                ? (token.provider as string)
                : undefined
            session.user.name = user_data.user?.name
            session.user.image = user_data.user?.image

            session.user.role = user_data.user?.role
            session.user.handle = user_data.artist?.handle
            session.user.artist_id = user_data.artist?.id

            return session
        }
    }
}

export const getServerAuthSession = () => getServerSession(authOptions)

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
