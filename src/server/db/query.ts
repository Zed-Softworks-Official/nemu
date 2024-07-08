import { and, eq, type InferSelectModel } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { AsRedisKey, cache } from '~/server/cache'
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

//////////////////////////////////////////////////////////
// Aritst Data
//////////////////////////////////////////////////////////
type ArtistData = InferSelectModel<typeof artists> & {
    user: User
    header: NemuImageData
}

export const get_artist_data = unstable_cache(
    async (handle: string) => {
        const cachedArtist = await cache.json.get(AsRedisKey('artists', handle))

        if (cachedArtist) {
            return cachedArtist as ArtistData
        }

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
            user: await clerkClient.users.getUser(artist.user_id),
            header: {
                url: header_photo,
                blur_data: await get_blur_data(header_photo)
            }
        }

        await cache.json.set(AsRedisKey('artists', handle), '$', result)

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
        const cachedCommission = await cache.json.get(
            AsRedisKey('commissions', handle, slug)
        )

        if (cachedCommission) {
            return cachedCommission as ClientCommissionItem
        }

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
            price: format_to_currency(Number(commission.price)),
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

        await cache.json.set(AsRedisKey('commissions', handle, slug), '$', result)

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
        const cachedCommissions = await cache.json.get(
            AsRedisKey('commissions', artist_id)
        )

        if (cachedCommissions) {
            return cachedCommissions as ClientCommissionItem[]
        }

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
                price: format_to_currency(Number(commission.price)),
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

        await cache.json.set(AsRedisKey('commissions', artist_id), '$', result)

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
        const cachedRequests = await cache.json.get(AsRedisKey('requests', user_id))

        if (cachedRequests) {
            return cachedRequests as ClientRequestData[]
        }

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
                user: await clerkClient.users.getUser(request.user_id)
            })
        }

        await cache.json.set(AsRedisKey('requests', user_id), '$', result)

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
        const cachedRequest = await cache.json.get(AsRedisKey('requests', order_id))

        if (cachedRequest) {
            return cachedRequest as ClientRequestData
        }

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

        const result: ClientRequestData = {
            ...request,
            user: await clerkClient.users.getUser(request.user_id),
            delivery: delivery,
            invoice: request.invoice ?? undefined,
            kanban: request.kanban ?? undefined
        }

        await cache.json.set(AsRedisKey('requests', order_id), '$', result)

        return result
    },
    ['commission_requests'],
    { tags: ['commission_requests'] }
)

//////////////////////////////////////////////////////////
// Forms List
//////////////////////////////////////////////////////////
export const get_form_list = unstable_cache(
    async (artist_id: string) => {
        const cachedForms = await cache.json.get(AsRedisKey('forms', artist_id))

        if (cachedForms) {
            return cachedForms as InferSelectModel<typeof forms>[]
        }

        const db_forms = await db.query.forms.findMany({
            where: eq(forms.artist_id, artist_id)
        })

        if (!db_forms) {
            return undefined
        }

        await cache.json.set(AsRedisKey('forms', artist_id), '$', db_forms)

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
        const cachedForm = await cache.json.get(AsRedisKey('forms', form_id))

        if (cachedForm) {
            return cachedForm as InferSelectModel<typeof forms>
        }

        const form = await db.query.forms.findFirst({
            where: eq(forms.id, form_id)
        })

        if (!form) {
            return undefined
        }

        await cache.json.set(AsRedisKey('forms', form_id), '$', form)

        return form
    },
    ['form_details'],
    {
        tags: ['form']
    }
)
