import { clerkClient } from '@clerk/nextjs/server'
import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { isSupporter } from '~/app/api/stripe/sync'
import { chargeMethods, socialAgents } from '~/lib/types'
import { formatToCurrency, getUTUrl } from '~/lib/utils'
import { updateIndex } from '~/server/algolia/collections'

import { artistProcedure, createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { artists, commissions } from '~/server/db/schema'
import { utapi } from '~/server/uploadthing'

export const artistRouter = createTRPCRouter({
    getArtistData: publicProcedure
        .input(
            z.object({
                handle: z.string()
            })
        )
        .query(async ({ ctx, input }) => {
            const clerkClientPromise = clerkClient()
            const artistPromise = ctx.db.query.artists.findFirst({
                where: eq(artists.handle, input.handle),
                with: {
                    commissions: {
                        where: eq(commissions.published, true)
                    },
                    portfolio: true,
                    forms: true,
                    products: true
                }
            })

            const [clerk, artist] = await Promise.all([clerkClientPromise, artistPromise])

            if (!artist) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Artist not found'
                })
            }

            const user = await clerk.users.getUser(artist.userId)
            const portfolioItems = artist.portfolio.map((portfolio) => ({
                ...portfolio,
                image: {
                    url: getUTUrl(portfolio.utKey)
                }
            }))

            const commissionList = artist.commissions.map((commission) => ({
                ...commission,
                images: commission.images.map((image) => ({
                    url: getUTUrl(image.utKey)
                }))
            }))

            const productsList = artist.products.map((product) => ({
                ...product,
                download: undefined,
                price: formatToCurrency(product.price / 100),
                images: product.images.map((image) => ({
                    url: getUTUrl(image)
                }))
            }))

            const supporter = await isSupporter(artist.userId)
            return {
                ...artist,
                supporter,
                headerPhoto: getUTUrl(artist.headerPhoto),
                portfolio: portfolioItems,
                commissions: commissionList,
                products: productsList,
                user: {
                    username: user.username,
                    profilePicture: user.imageUrl
                }
            }
        }),

    getArtistSettings: artistProcedure.query(async ({ ctx }) => {
        return {
            about: ctx.artist.about,
            location: ctx.artist.location,
            terms: ctx.artist.terms,
            tipJarUrl: ctx.artist.tipJarUrl,
            socials: ctx.artist.socials,
            chargeMethod: ctx.artist.defaultChargeMethod
        }
    }),

    setArtistSettings: artistProcedure
        .input(
            z.object({
                about: z.string().optional(),
                location: z.string().optional(),
                terms: z.string().optional(),
                tipJarUrl: z.string().url().nullable(),
                socials: z
                    .array(
                        z.object({
                            url: z.string().url(),
                            agent: z.enum(socialAgents)
                        })
                    )
                    .optional(),
                headerImageKey: z.string().optional(),
                defaultChargeMethod: z.enum(chargeMethods)
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (input.headerImageKey) {
                const deletePromise = utapi.deleteFiles(ctx.artist.headerPhoto)

                const algoliaUpdate = updateIndex('artists', {
                    objectID: ctx.artist.id,
                    handle: ctx.artist.handle,
                    about: ctx.artist.about,
                    imageUrl: getUTUrl(input.headerImageKey)
                })

                await Promise.all([deletePromise, algoliaUpdate])
            }

            await ctx.db
                .update(artists)
                .set({
                    about: input.about,
                    location: input.location,
                    terms: input.terms,
                    tipJarUrl: input.tipJarUrl,
                    socials: input.socials,
                    headerPhoto: input.headerImageKey,
                    defaultChargeMethod: input.defaultChargeMethod
                })
                .where(eq(artists.id, ctx.artist.id))
        })
})
