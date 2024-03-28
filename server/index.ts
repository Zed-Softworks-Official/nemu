import { router } from './trpc'
import { get_artist, get_commissions, get_portfolio_items, get_products } from './procedures/artist-procedures'

export const appRouter = router({
    get_artist,
    get_commissions,
    get_products,
    get_portfolio_items
})

export type AppRouter = typeof appRouter
