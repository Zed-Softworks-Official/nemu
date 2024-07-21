import { env } from '~/env'
import { Novu } from '@novu/node'

const globalForNovu = global as unknown as { novu: Novu }

export const novu = globalForNovu.novu || new Novu(env.NOVU_API_KEY)

if (env.NODE_ENV !== 'production') globalForNovu.novu = novu

export enum NovuWorkflows {
    SignUpApproved = 'sign-up-approved',
    SignUpRejected = 'sign-up-rejected',
    SignUpPending = 'status-pending',
    CommissionRequestArtistEnd = 'commission-request-artist-end',
    CommissionRequestUserEnd = 'commission-request-user-end',
    CommissionDetermineRequest = 'commission-determine-request',
    InvoicePaid = 'invoice-paid',
    InvoiceSent = 'invoice-sent'
}
