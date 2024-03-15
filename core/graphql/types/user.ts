import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { AWSLocations, DownloadData } from '@/core/structures'
import { Commission, Product } from '@prisma/client'
import { S3GetSignedURL } from '@/core/storage'

builder.prismaObject('User', {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name', { nullable: true }),
        email: t.exposeString('email', { nullable: true }),
        emailVerified: t.expose('emailVerified', { nullable: true, type: 'Date' }),
        image: t.exposeString('image', { nullable: true }),
        role: t.exposeInt('role', { nullable: true }),

        formSubmissions: t.relation('formSubmissions'),
        artist: t.relation('artist', { nullable: true }),

        customerIds: t.relation('customerIds'),

        find_customer_id: t.prismaField({
            type: 'StripeCustomerIds',
            args: {
                artist_id: t.arg({
                    type: 'String',
                    required: true
                })
            },
            resolve: (query, parent, args, _ctx, _info) =>
                prisma.stripeCustomerIds.findFirstOrThrow({
                    ...query,
                    where: {
                        userId: parent.id,
                        artistId: args.artist_id
                    }
                })
        }),

        downloads: t.field({
            type: ['DownloadData'],
            description: 'Gets all downloads for the user',
            nullable: true,
            resolve: async (current_user) => {
                const downloads = await prisma.downloads.findMany({
                    where: {
                        userId: current_user.id
                    }
                })

                if (!downloads) {
                    return null
                }

                const result: DownloadData[] = []
                // Get the data associated with the downloads
                for (const download of downloads) {
                    const artist = await prisma.artist.findFirst({
                        where: {
                            id: download.artistId
                        }
                    })

                    if (!artist) {
                        return result
                    }

                    let item: Commission | Product | undefined | null
                    if (download.commissionId) {
                        item = await prisma.commission.findFirst({
                            where: {
                                id: download.commissionId
                            }
                        })
                    } else if (download.productId) {
                        item = await prisma.product.findFirst({
                            where: {
                                id: download.productId
                            }
                        })
                    }

                    if (!item) {
                        return null
                    }

                    result.push({
                        download_url: await S3GetSignedURL(
                            artist.id,
                            AWSLocations.Downloads,
                            download.fileKey
                        ),
                        receipt_url: download.receiptURL || undefined,
                        created_at: download.createdAt,
                        artist_handle: artist.handle
                    })
                }

                return result
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
        resolve: (query, _parent, _args, _ctx, _info) => prisma.user.findMany({ ...query })
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
