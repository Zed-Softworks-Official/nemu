import { inferRouterOutputs, inferRouterInputs } from '@trpc/server'
import { z } from 'zod'

import { AppRouter } from '~/server/api/root'

export * from '~/core/structures/user-structures'
export * from '~/core/structures/commission-structures'
export * from '~/core/structures/kanban-structures'
export * from '~/core/structures/stripe-structures'
export * from '~/core/structures/portfolio-structures'
export * from '~/core/structures/artist-structures'
export * from '~/core/structures/form-structures'
export * from '~/core/structures/image-structures'

/**
 * TRPC Base Router Output Response Object
 */
export type RouterOutput = inferRouterOutputs<AppRouter>

/**
 * TRPC Base Router Input Response Object
 */
export type RouterInput = inferRouterInputs<AppRouter>
