import { Knock } from '@knocklabs/node'
import { env } from '~/env'

const globalForKnock = global as unknown as { knock: Knock }

export const knock = globalForKnock.knock || new Knock(env.KNOCK_API_KEY)

if (env.NODE_ENV !== 'production') globalForKnock.knock = knock

export enum KnockWorkflows {
    VerificationApproved = 'verification-approved',
    VerificationPending = 'verification-pending'
}
