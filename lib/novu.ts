import { Novu } from '@novu/node'

const globalForNovu = global as unknown as { novu: Novu }

export const novu = globalForNovu.novu || new Novu(process.env.NOVU_API_KEY)

if (process.env.NODE_ENV !== 'production') globalForNovu.novu = novu
