import { StatusCode } from '@/core/responses'
import { builder } from '../builder'
import { prisma } from '@/lib/prisma'
import { novu } from '@/lib/novu'

builder.prismaObject('Downloads', {
    fields: (t) => ({
        id: t.exposeString('id'),
        userId: t.exposeString('userId'),
        fileKey: t.exposeString('fileKey'),
        receiptURL: t.exposeString('receiptURL', { nullable: true }),

        createdAt: t.expose('createdAt', { type: 'Date' }),

        artistId: t.exposeString('artistId'),
        productId: t.exposeString('productId', { nullable: true }),
        commissionId: t.exposeString('commissionId', { nullable: true }),
        formSubmissionId: t.exposeString('formSubmissionId', { nullable: true }),

        product: t.prismaField({
            type: 'Product',
            nullable: true,
            resolve: (query, parent) => prisma.product.findFirst({
                ...query,
                where: {
                    id: parent.productId!
                }
            })
        }),

        commission: t.prismaField({
            type: 'Commission',
            nullable: true,
            resolve: (query, parent) => prisma.commission.findFirst({
                ...query,
                where: {
                    id: parent.commissionId!
                }
            })
        }),

        formSubmission: t.prismaField({
            type: 'FormSubmission',
            nullable: true,
            resolve: (query, parent) => prisma.formSubmission.findFirst({
                ...query,
                where: {
                    id: parent.formSubmissionId!
                }
            })
        }),

        user: t.relation('user')
    })
})

builder.mutationField('create_download', (t) =>
    t.field({
        type: 'NemuResponse',
        args: {
            download_data: t.arg({
                type: 'DownloadDataInputType',
                required: true
            })
        },
        resolve: async (_parent, args) => {
            const new_download = await prisma.downloads.create({
                data: {
                    userId: args.download_data.user_id!,
                    fileKey: args.download_data.file_key!,
                    receiptURL: args.download_data.receipt_url,

                    artistId: args.download_data.artist_id!,
                    productId: args.download_data.product_id,
                    commissionId: args.download_data.commission_id,
                    formSubmissionId: args.download_data.form_submission_id
                }
            })

            if (!new_download) {
                return {
                    status: StatusCode.InternalError,
                    message: 'Failed to create new download'
                }
            }

            // Notify User
            const commission = await prisma.commission.findFirst({
                where: {
                    id: args.download_data.commission_id!
                },
                include: {
                    artist: true
                }
            })

            novu.trigger('downloads-available', {
                to: {
                    subscriberId: args.download_data.user_id!
                },
                payload: {
                    item_name: commission?.title,
                    artist_handle: commission?.artist.handle
                }
            })

            return { 
                status: StatusCode.Success,
                message: new_download.id
            }
        }
    })
)
