import { Artist, Prisma, Product } from '@prisma/client'
import { AWSLocations, ConvertShopItemFromProductOptions, ShopItem } from './structures'
import { S3GetSignedURL } from './storage'
import { sendbird } from '@/lib/sendbird'
import { prisma } from '@/lib/prisma'
import { SendbirdUserData } from '@/sendbird/sendbird-structures'

import { getPlaiceholder } from 'plaiceholder'
import { RouterInput } from './responses'
import { StripeCreateAccount } from './payments'
import { TRPCError } from '@trpc/server'

/**
 *
 * @param submission_id
 * @param sendbird_channel_url
 */
export async function CreateSendbirdMessageChannel(
    submission_id: string,
    sendbird_channel_url: string
) {
    const request = await prisma.request.findFirst({
        where: {
            id: submission_id
        },
        include: {
            user: {
                include: {
                    artist: true
                }
            },
            form: {
                include: {
                    commission: {
                        include: {
                            artist: true
                        }
                    }
                }
            }
        }
    })

    await sendbird.CreateGroupChannel({
        name: `${
            request?.user.artist
                ? '@' + request.user.artist.handle
                : request?.user.name
        }`,
        channel_url: sendbird_channel_url,
        cover_url: request?.user.artist?.profilePhoto
            ? request.user.artist.profilePhoto
            : `${process.env.BASE_URL}/profile.png`,
        user_ids: [request?.userId!, request?.commission?.artist.userId!],
        operator_ids: [request?.commission.artist],
        block_sdk_user_channel_join: false,
        is_distinct: false
    })
}

/**
 *
 * @param user_id
 * @returns
 */
export async function CheckCreateSendbirdUser(user_id: string) {
    // Get the user
    const user = await prisma.user.findFirst({
        where: {
            id: user_id
        }
    })

    // Check if the user has a sendbird account
    if (user?.hasSendbirdAccount) {
        return
    }

    // Create a new sendbird account
    const user_data: SendbirdUserData = {
        user_id: user_id,
        nickname: user?.name!,
        profile_url: user?.image || `${process.env.BASE_URL}/profile.png`
    }

    await sendbird.CreateUser(user_data)

    // Update User in database
    await prisma.user.update({
        where: {
            id: user_id
        },
        data: {
            hasSendbirdAccount: true
        }
    })
}

/**
 *
 * @param product
 * @param artist
 * @param options
 * @returns
 */
export async function CreateShopItemFromProducts(
    product: Product,
    artist: Artist,
    options?: ConvertShopItemFromProductOptions
) {
    const featured_image_signed_url = await S3GetSignedURL(
        artist.id,
        AWSLocations.Store,
        product.featuredImage
    )

    let item: ShopItem = {
        id: product.id,

        title: product.title,
        description: product.description,
        price: product.price,
        featured_image: {
            signed_url: featured_image_signed_url,
            blur_data: (await GetBlurData(featured_image_signed_url)).base64,
            image_key: options?.get_featured_image_key ? product.featuredImage : undefined
        },
        images: [],
        edit_images: [],

        slug: product.slug,
        artist_id: artist.id,
        stripe_account: artist.stripeAccount
    }

    if (options?.get_download_asset) {
        item.downloadable_asset = await S3GetSignedURL(
            artist.id,
            AWSLocations.Downloads,
            product.downloadableAsset
        )
    }

    if (options?.get_download_key) {
        item.download_key = product.downloadableAsset
    }

    if (options?.editable) {
        for (const image of product.additionalImages) {
            const signed_url = await S3GetSignedURL(artist.id, AWSLocations.Store, image)

            item.edit_images?.push({
                file_key: image,
                signed_url: signed_url,
                aws_location: AWSLocations.Store,
                file_name: `Image ${image}`,
                featured: false
            })
        }
    } else {
        for (const image of product.additionalImages) {
            const signed_url = await S3GetSignedURL(artist.id, AWSLocations.Store, image)

            item.images?.push({
                signed_url: signed_url,
                blur_data: (await GetBlurData(signed_url)).base64,
                image_key: image
            })
        }
    }

    return item
}

export async function GetBlurData(src: string) {
    const buffer = await fetch(src).then(async (res) =>
        Buffer.from(await res.arrayBuffer())
    )
    const data = await getPlaiceholder(buffer)

    return data
}

export async function CreateArtist(
    input: RouterInput['verification']['set_verification'],
    user_id: string
) {
    const socials: Prisma.SocialCreateWithoutArtistInput[] = []

    if (input.twitter) {
        socials.push({
            agent: 'TWITTER',
            url: input.twitter
        })
    }

    if (input.pixiv) {
        socials.push({
            agent: 'PIXIV',
            url: input.pixiv
        })
    }

    if (input.website) {
        socials.push({
            agent: 'WEBSITE',
            url: input.website
        })
    }

    const stripe_account = await StripeCreateAccount()

    // Create Artist inside database
    const artist = await prisma.artist.create({
        data: {
            stripeAccount: stripe_account.id,
            userId: user_id,
            handle: input.requested_handle!,
            socials: {
                createMany: {
                    data: socials
                }
            }
        },
        include: {
            user: true
        }
    })

    if (!artist) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not create artist'
        })
    }

    // Check if the user already has a sendbird account
    if (!artist.user?.hasSendbirdAccount) {
        // Create Sendbird user
        const user_data: SendbirdUserData = {
            user_id: user_id,
            nickname: artist.handle,
            profile_url: artist?.profilePhoto
                ? artist?.profilePhoto
                : `${process.env.BASE_URL}/profile.png`
        }

        sendbird.CreateUser(user_data)

        // Update database
        await prisma.user.update({
            where: {
                id: user_id
            },
            data: {
                hasSendbirdAccount: true
            }
        })
    }

    return artist
}
