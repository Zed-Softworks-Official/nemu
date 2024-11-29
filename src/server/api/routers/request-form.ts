import { artistProcedure, createTRPCRouter } from '../trpc'
import { eq } from 'drizzle-orm'
import { forms } from '~/server/db/schema'

export const request_form_router = createTRPCRouter({
    get_forms_list: artistProcedure.query(async ({ ctx }) => {
        return await ctx.db.query.forms.findMany({
            where: eq(forms.artist_id, ctx.artist.id)
        })
    })
})
