import { builder } from '../builder'

builder.prismaObject('StripeCustomerIds', {
    fields: (t) => ({
        id: t.exposeString('id'),
        customerId: t.exposeString('customerId'),
        stripeAccount: t.exposeString('stripeAccount'),

        artistId: t.exposeString('artistId'),
        userId: t.exposeString('userId'),

        artist: t.relation('artist'),
        user: t.relation('user')
    })
})