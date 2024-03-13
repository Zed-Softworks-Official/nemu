import { prisma } from '@/lib/prisma'
import { builder } from '../builder'
import { StatusCode } from '@/core/responses'
import { AWSLocations } from '@/core/structures'
import { S3GetSignedURL, S3Upload } from '@/core/storage'

builder.prismaObject('Portfolio', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        image: t.exposeString('image'),
        name: t.exposeString('name'),
        artist: t.relation('artist'),

        createdAt: t.expose('createdAt', { type: 'Date' })
    })
})

/**
 * Get Portfolio Item
 *
 * Gets a specific portfolio item
 */
builder.queryField('portfolio_item', (t) =>
    t.field({
        type: 'PortfolioData',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The artists handle for the image'
            }),
            item_id: t.arg({
                type: 'String',
                required: true,
                description: 'The specific item id you are requesting'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            const portfolio_item = await prisma.portfolio.findFirstOrThrow({
                where: {
                    artistId: args.artist_id,
                    image: args.item_id
                }
            })

            const signed_url = await S3GetSignedURL(args.artist_id, AWSLocations.Portfolio, portfolio_item.image)

            return {
                signed_url: signed_url,
                image_key: portfolio_item.image,
                name: portfolio_item.name
            }
        }
    })
)

/**
 * Create Portfolio Item
 *
 * Mutation field that creates a portfolio item and uploads
 */
builder.mutationField('create_portfolio_item', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            image: t.arg({
                type: 'String',
                required: true,
                description: 'The image key to be used for AWS'
            }),
            name: t.arg({
                type: 'String',
                required: true,
                description: 'The name of the portfolio item'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Create Portfolio Item
            const item = await prisma.portfolio.create({
                data: {
                    artistId: args.artist_id,
                    name: args.name,
                    image: args.image
                }
            })

            if (!item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Error creating entry in database'
                }
            }

            return {
                status: StatusCode.Success
            }
        }
    })
)

/**
 * Update Portfolio Item
 *
 * Mutation field that updates an existing portfolio item
 */
builder.mutationField('update_portfolio_item', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            image_key: t.arg({
                type: 'String',
                required: true,
                description: 'the image key used to find the particular item in the database'
            }),
            new_image_key: t.arg({
                type: 'String',
                required: false,
                description: 'The new image key to be used for AWS'
            }),
            name: t.arg({
                type: 'String',
                required: false,
                description: 'The name of the portfolio item'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Find portfolio item
            const portfolio_item = await prisma.portfolio.findFirstOrThrow({
                where: {
                    artistId: args.artist_id,
                    image: args.image_key
                }
            })

            // Check if it exists
            if (!portfolio_item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to find portoflio item'
                }
            }

            // Update the item
            const updated_item = await prisma.portfolio.update({
                where: {
                    id: portfolio_item.id
                },
                data: {
                    image: args.new_image_key || undefined,
                    name: args.name || undefined
                }
            })

            // Check if it's updated
            if (!updated_item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to update item'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)

/**
 * Delete Portfolio Item
 *
 * Mutation field that deleting an existing portfolio item
 */
builder.mutationField('delete_portfolio_item', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            artist_id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the artist'
            }),
            image_key: t.arg({
                type: 'String',
                required: true,
                description: 'The image key used for AWS'
            })
        },
        resolve: async (_parent, args, _ctx, _info) => {
            // Get Portfolio Item
            const portfolio_item = await prisma.portfolio.findFirstOrThrow({
                where: {
                    artistId: args.artist_id,
                    image: args.image_key
                }
            })

            // Check if it exists
            if (!portfolio_item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to find portfolio item'
                }
            }

            // Delete from database
            const deleted_item = await prisma.portfolio.delete({
                where: {
                    id: portfolio_item.id
                }
            })

            // Check if it was successful
            if (!deleted_item) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Unable to delete from database'
                }
            }

            return { status: StatusCode.Success }
        }
    })
)
