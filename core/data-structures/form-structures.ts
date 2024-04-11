import { Request, Invoice, InvoiceItem, User } from '@prisma/client'
import { AWSEndpoint } from './aws-structures'
import { RouterOutput } from '../responses'

export interface CreateFormSubmissionStructure {
    user_id: string
    form_id: string
    content: string
}

export enum CommissionStatus {
    WaitingApproval,
    Accepted,
    Rejected,
    Delivered
}

export enum AWSModification {
    Added,
    Removed
}

export interface AWSFileModification {
    file_key: string
    aws_location: AWSEndpoint
    signed_url?: string
    file_name?: string
    featured?: boolean

    modification?: AWSModification
    updated_file?: File
    blob?: string
}

export type CommissionRequestData = Request & { user: User }

export type GetUserRequestsResponse = RouterOutput['user']['get_requests']

export type CommissionDataInvoice =
    | (Invoice & { items: InvoiceItem[] | undefined })
    | undefined
