import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { DownloadData } from '@/core/structures'
import { StripeGetStoreProductInfo } from '@/core/payments'

builder.prismaObject('User', {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name', { nullable: true }),
        email: t.exposeString('email', { nullable: true }),
        emailVerified: t.expose('emailVerified', { nullable: true, type: 'Date' }),
        image: t.exposeString('image', { nullable: true }),
        role: t.exposeInt('role', { nullable: true }),

        artist: t.relation('artist', { nullable: true }),
        purchased: t.field({
            type: ['DownloadData'],
            description: 'Gets all purchases for user',
            resolve: async (current_user) => {
                // Get the user and their purchases
                const user = await prisma.user.findFirst({
                    where: {
                        id: current_user.id
                    },
                    include: {
                        purchased: true
                    }
                })

                // Get the data associated with the downloads
                const downloads: DownloadData[] = []
                if (user?.purchased) {
                    for (let i = 0; i < user?.purchased.length; i++) {
                        if (!user.purchased[i].complete) {
                            break
                        }

                        const product = await StripeGetStoreProductInfo(
                            user?.purchased[i].productId,
                            user?.purchased[i].stripeAccId,
                            true
                        )

                        const artist = await prisma.artist.findFirst({
                            where: {
                                stripeAccId: user.purchased[i].stripeAccId
                            }
                        })

                        downloads.push({
                            name: product.name!,
                            price: product.price,
                            artist: artist?.handle!,
                            url: product.asset!
                        })
                    }
                }

                return downloads
            }
        })
    })
})

/**
 * Gets all users
 */
builder.queryField('users', (t) =>
    t.prismaField({
        type: ['User'],
        resolve: (query, _parent, _args, _ctx, _info) =>
            prisma.user.findMany({ ...query })
    })
)

/**
 * Get's a specific user
 */
builder.queryField('user', (t) =>
    t.prismaField({
        type: 'User',
        args: {
            id: t.arg({
                type: 'String',
                required: true,
                description: 'Id of the user'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.user.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id
                }
            })
    })
)

/**
 * Updates a users username
 */
builder.mutationField('change_username', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            user_id: t.arg({
                type: 'String',
                required: true,
                description: 'The user id to change the username too'
            }),
            username: t.arg({
                type: 'String',
                required: true,
                description: 'The users new username'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Check if username already exists
            const username = await prisma.user.findFirst({
                where: {
                    name: args.username
                }
            })

            if (username) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Username already exists!'
                }
            }

            // Update the username
            const response = await prisma.user.update({
                where: {
                    id: args.user_id
                },
                data: {
                    name: args.username
                }
            })

            if (!response) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to set username!'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)

/**
 * Updates a users role
 */
builder.mutationField('update_role', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            user_id: t.arg({
                type: 'String',
                required: true,
                description: 'The user id of the user of which to update the role'
            }),
            role: t.arg({
                type: 'Int',
                required: true,
                description: 'The role to swich the user to'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const updated_user = await prisma.user.update({
                where: {
                    id: args.user_id
                },
                data: {
                    role: args.role
                }
            })

            if (!updated_user) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to update user role!'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)
