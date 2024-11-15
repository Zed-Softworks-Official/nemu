import { Knock } from '@knocklabs/node'
import { env } from '~/env'

const globalForKnock = global as unknown as { knock: Knock }

export const knock = globalForKnock.knock || new Knock(env.KNOCK_API_KEY)

if (env.NODE_ENV !== 'production') globalForKnock.knock = knock

export enum KnockWorkflows {
    VerificationApproved = 'verification-approved',
    VerificationDeclined = 'verification-declined',
    VerificationPending = 'verification-pending',

    InvoiceSent = 'invoice-sent',
    InvoicePaid = 'invoice-paid',

    CommissionRequestUserEnd = 'commission-request-user-end',
    CommissionRequestArtistEnd = 'commission-request-artist-end',
    CommissionDetermineRequest = 'commission-determine-request'
}
