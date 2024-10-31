import { and, eq, type InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { artists, commissions, type downloads, forms, requests } from '~/server/db/schema'
import { clerkClient, type User } from '@clerk/nextjs/server'
import type {
    ClientCommissionItem,
    ClientRequestData,
    CommissionAvailability,
    NemuImageData
} from '~/core/structures'
import { db } from '.'
import { get_blur_data } from '~/lib/blur_data'
import { convert_images_to_nemu_images } from '~/lib/server-utils'
import { format_to_currency } from '~/lib/utils'
import { env } from '~/env'
import { StripeGetAccount } from '~/core/payments'

//////////////////////////////////////////////////////////
// Aritst Data
//////////////////////////////////////////////////////////
type ArtistData = InferSelectModel<typeof artists> & {
    user: User
    header: NemuImageData
}

export const get_artist_data = unstable_cache(
    async (handle: string) => {
        const artist = await db.query.artists.findFirst({
            where: eq(artists.handle, handle)
        })

        if (!artist) {
            return undefined
        }

        const header_photo = artist.ut_key
            ? artist.header_photo
            : env.BASE_URL + artist.header_photo

        const result: ArtistData = {
            ...artist,
            user: await clerkClient().users.getUser(artist.user_id),
            header: {
                url: header_photo,
                blur_data: await get_blur_data(header_photo)
            }
        }

        return result
    },
    ['artist-data'],
    { tags: ['artist_data'] }
)

//////////////////////////////////////////////////////////
// Commission Data
//////////////////////////////////////////////////////////

export const get_commission = unstable_cache(
    async (handle: string, slug: string) => {
        // Get the artist from the db to fetch the commission
        const artist = await db.query.artists.findFirst({
            where: eq(artists.handle, handle)
        })

        if (!artist) {
            return undefined
        }

        // Get commission from db
        const commission = await db.query.commissions.findFirst({
            where: and(eq(commissions.slug, slug), eq(commissions.artist_id, artist.id))
        })

        if (!commission) {
            return undefined
        }

        // Format images for client
        const images = await convert_images_to_nemu_images(commission.images)
        const result: ClientCommissionItem = {
            title: commission.title,
            description: commission.description,
            price: format_to_currency(Number(commission.price / 100)),
            availability: commission.availability as CommissionAvailability,
            rating: Number(commission.rating),
            images: images,
            slug: commission.slug,
            published: commission.published,

            id: commission.id,
            form_id: commission.form_id,

            artist: {
                handle: artist.handle,
                supporter: artist.supporter,
                terms: artist.terms
            }
        }

        return result
    },
    ['commission'],
    { tags: ['commission'] }
)

//////////////////////////////////////////////////////////
// Commission List
//////////////////////////////////////////////////////////

export const get_commission_list = unstable_cache(
    async (artist_id: string) => {
        const db_commissions = await db.query.commissions.findMany({
            where: eq(commissions.artist_id, artist_id),
            with: {
                artist: true
            }
        })

        if (!db_commissions) {
            return undefined
        }

        // Format for client
        const result: ClientCommissionItem[] = []
        for (const commission of db_commissions) {
            result.push({
                title: commission.title,
                description: commission.description,
                price: format_to_currency(Number(commission.price / 100)),
                availability: commission.availability as CommissionAvailability,
                rating: Number(commission.rating),
                published: commission.published,
                images: [
                    {
                        url: commission.images[0]!.url,
                        blur_data: await get_blur_data(commission.images[0]!.url)
                    }
                ],
                slug: commission.slug,
                total_requests: commission.total_requests,
                new_requests: commission.new_requests,
                artist: {
                    handle: commission.artist.handle,
                    supporter: commission.artist.supporter
                }
            })
        }

        return result
    },
    ['commission_list'],
    {
        tags: ['commission_list']
    }
)

//////////////////////////////////////////////////////////
// Request List
//////////////////////////////////////////////////////////
export const get_request_list = unstable_cache(
    async (user_id: string) => {
        const db_requests = await db.query.requests.findMany({
            where: eq(requests.user_id, user_id),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                }
            }
        })

        if (!db_requests) {
            return []
        }

        // Format for client
        const result: ClientRequestData[] = []
        for (const request of db_requests) {
            result.push({
                ...request,
                commission: {
                    ...request.commission,
                    images: [
                        {
                            url: request.commission.images[0]!.url,
                            blur_data: await get_blur_data(
                                request.commission.images[0]!.url
                            )
                        }
                    ]
                },
                user: await clerkClient().users.getUser(request.user_id)
            })
        }

        return result
    },
    ['request_list'],
    { tags: ['commission_requests'] }
)

//////////////////////////////////////////////////////////
// Requests Details
//////////////////////////////////////////////////////////
export const get_request_details = unstable_cache(
    async (order_id: string) => {
        const clerk_client = await clerkClient()
        const request = await db.query.requests.findFirst({
            where: eq(requests.order_id, order_id),
            with: {
                commission: {
                    with: {
                        artist: true
                    }
                },
                download: true,
                invoice: {
                    with: {
                        invoice_items: true
                    }
                },
                kanban: true
            }
        })

        if (!request) {
            return undefined
        }

        let delivery:
            | (InferSelectModel<typeof downloads> & {
                  blur_data?: string
                  file_type: 'image' | 'zip'
              })
            | undefined = undefined

        if (request.download) {
            const file_type: 'image' | 'zip' = request.download.url.includes('.zip')
                ? 'zip'
                : 'image'

            delivery = {
                ...request.download,
                blur_data:
                    file_type === 'image'
                        ? await get_blur_data(request.download.url)
                        : undefined,
                file_type
            }
        }

        const user = await clerk_client.users.getUser(request.user_id)
        const result: ClientRequestData = {
            ...request,
            user: {
                id: request.user_id,
                username: user.username ?? 'User'
            },
            delivery: delivery,
            invoice: request.invoice ?? undefined,
            kanban: request.kanban ?? undefined
        }

        return result
    },
    ['commission_requests'],
    { tags: ['commission_requests'] }
)

//////////////////////////////////////////////////////////
// Forms List
//////////////////////////////////////////////////////////
export const get_form_list = unstable_cache(
    async (artist_id: string | null) => {
        if (artist_id === null) return null

        const db_forms = await db.query.forms.findMany({
            where: eq(forms.artist_id, artist_id)
        })

        if (!db_forms) {
            return undefined
        }

        return db_forms
    },
    ['forms'],
    {
        tags: ['forms_list']
    }
)

//////////////////////////////////////////////////////////
// Form Details
//////////////////////////////////////////////////////////
export const get_form = unstable_cache(
    async (form_id: string) => {
        const form = await db.query.forms.findFirst({
            where: eq(forms.id, form_id)
        })

        if (!form) {
            return undefined
        }

        // await cache.json.set(AsRedisKey('forms', form_id), '$', form)

        return form
    },
    ['form_details'],
    {
        tags: ['form']
    }
)

//////////////////////////////////////////////////////////
// Stripe
//////////////////////////////////////////////////////////
export const is_onboarding_complete = unstable_cache(
    async (artist_id: string) => {
        const artist = await db.query.artists.findFirst({
            where: eq(artists.id, artist_id)
        })

        if (!artist) {
            return false
        }

        const stripe_account = await StripeGetAccount(artist.stripe_account)

        if (!stripe_account.charges_enabled) {
            return false
        }

        return true
    },
    ['stripe_onboarding'],
    {
        tags: ['stripe_onboarding'],
        revalidate: 3600
    }
)
