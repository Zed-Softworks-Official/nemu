import { env } from '~/env'
import { Novu } from '@novu/node'

const globalForNovu = global as unknown as { novu: Novu }

export const novu = globalForNovu.novu || new Novu(env.NOVU_API_KEY)

if (env.NODE_ENV !== 'production') globalForNovu.novu = novu
