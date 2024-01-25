import { builder } from '../builder'

builder.prismaObject('Social', {
    fields: (t) => ({
        id: t.exposeString('id'),
        artistId: t.exposeString('artistId'),
        agent: t.exposeString('agent'),
        url: t.exposeString('url'),

        artist: t.relation('artist')
    })
})