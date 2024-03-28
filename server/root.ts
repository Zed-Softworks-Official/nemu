import { router } from './trpc'

import {
    get_customer_id,
    get_downloads,
    update_role,
    update_username
} from './procedures/user'

import { get_artist } from './procedures/artist'
import { get_artist_code, set_artist_code } from './procedures/artist-code'
import { get_commissions } from './procedures/commission'
import { get_product, get_products } from './procedures/artist-corner'
import {
    get_portfolio_item,
    get_portfolio_items,
    set_portfolio_item
} from './procedures/portfolio'

export const appRouter = router({
    artist: router({
        get_artist
    }),
    commissions: router({
        get_commissions
    }),
    artist_corner: router({
        get_products,
        get_product
    }),
    portfolio: router({
        get_portfolio_items,
        get_portfolio_item,

        set_portfolio_item
    }),
    artist_code: router({
        get_artist_code,

        set_artist_code
    }),
    user: router({
        get_customer_id,
        get_downloads,

        update_username,
        update_role
    }),
    stripe: router({})
})

export type AppRouter = typeof appRouter
