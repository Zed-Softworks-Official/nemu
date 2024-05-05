import { inferRouterOutputs, inferRouterInputs } from '@trpc/server'
import { AppRouter } from '~/server/api/root'

export * from '~/core/data-structures/user-structures'
export * from '~/core/data-structures/commission-structures'
export * from '~/core/data-structures/kanban-structures'
export * from '~/core/data-structures/stripe-structures'
export * from '~/core/data-structures/portfolio-structures'
export * from '~/core/data-structures/artist-structures'
export * from '~/core/data-structures/form-structures'

/**
 * Contains the url for the image as well as the blur data for the placeholder
 */
export type NemuImageData = {
    url: string
    blur_data: string
}

/**
 * TRPC Base Router Output Response Object
 */
export type RouterOutput = inferRouterOutputs<AppRouter>

/**
 * TRPC Base Router Input Response Object
 */
export type RouterInput = inferRouterInputs<AppRouter>
