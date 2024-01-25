import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('User', {
    fields: (t) => ({
        id: t.exposeString('id'),
        name: t.exposeString('name', { nullable: true }),
        email: t.exposeString('email', { nullable: true }),
        emailVerified: t.expose('emailVerified', { nullable: true, type: 'Date' }),
        image: t.exposeString('image', { nullable: true }),
        role: t.exposeInt('role', { nullable: true })
    })
})

builder.queryField('users', (t) =>
    t.prismaField({
        type: ['User'],
        resolve: (query, _parent, _args, _ctx, _info) =>
            prisma.user.findMany({ ...query })
    })
)
