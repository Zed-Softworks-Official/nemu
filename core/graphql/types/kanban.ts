import { prisma } from '@/lib/prisma'
import { builder } from '../builder'

builder.prismaObject('Kanban', {
    fields: (t) => ({
        id: t.exposeString('id'),
        containers: t.exposeString('containers'),
        tasks: t.exposeString('tasks')
    })
})

builder.queryField('kanban', (t) =>
    t.prismaField({
        type: 'Kanban',
        args: {
            id: t.arg({
                type: 'String',
                required: true,
                description: 'The id of the kanban'
            })
        },
        resolve: (query, _parent, args, _ctx, _info) =>
            prisma.kanban.findFirstOrThrow({
                ...query,
                where: {
                    id: args.id
                }
            })
    })
)
