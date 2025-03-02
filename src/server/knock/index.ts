import { Knock } from '@knocklabs/node'
import { env } from '~/env'

const globalForKnock = global as unknown as { knock: Knock }

export const knock = globalForKnock.knock || new Knock(env.KNOCK_API_KEY)

if (env.NODE_ENV !== 'production') globalForKnock.knock = knock

export enum KnockWorkflows {
    VerificationApproved = 'verification-approved',
    VerificationRejected = 'verification-rejected',
    VerificationPending = 'verification-pending',

    InvoiceSent = 'invoice-sent',
    InvoicePaid = 'invoice-paid',
    InvoiceOverdue = 'invoice-overdue',

    CommissionRequestUserEnd = 'commission-request-user-end',
    CommissionRequestArtistEnd = 'commission-request-artist-end',
    CommissionDetermineRequest = 'commission-determine-request'
}

export type WorkflowData = {
    recipients: string[]
    actor?: string
} & (
    | {
          type: KnockWorkflows.VerificationApproved
          data: {
              artist_handle: string
          }
      }
    | {
          type: KnockWorkflows.VerificationRejected
          data: undefined
      }
    | {
          type: KnockWorkflows.VerificationPending
          data: undefined
      }
    | {
          type: KnockWorkflows.InvoiceSent
          data: {
              commission_title: string
              artist_handle: string
              invoice_url: string
          }
      }
    | {
          type: KnockWorkflows.InvoicePaid
          data: {
              commission_title: string
              request_url: string
          }
      }
    | {
          type: KnockWorkflows.InvoiceOverdue
          data: {
              commission_title: string
              artist_handle: string
              commission_url: string
          }
      }
    | {
          type: KnockWorkflows.CommissionRequestUserEnd
          data: {
              artist_handle: string
              commission_title: string
          }
      }
    | {
          type: KnockWorkflows.CommissionRequestArtistEnd
          data: {
              commission_title: string
              requests_url: string
          }
      }
    | {
          type: KnockWorkflows.CommissionDetermineRequest
          data: {
              artist_handle: string
              commission_title: string
              status: string
          }
      }
)

export async function sendNotification(data: WorkflowData) {
    return await knock.workflows.trigger(data.type, {
        recipients: data.recipients,
        data: data.data,
        actor: data.actor
    })
}
