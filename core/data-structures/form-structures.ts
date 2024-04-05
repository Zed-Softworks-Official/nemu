import { Request, Invoice, InvoiceItem, User } from '@prisma/client'
import { AWSLocations } from './aws-structures'
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
    aws_location: AWSLocations
    signed_url?: string
    file_name?: string
    featured?: boolean

    modification?: AWSModification
    updated_file?: File
    blob?: string
}

export type CommissionRequestData = Request & { user: User }

export type GetSubmissionsResponse = RouterOutput['user']['get_submissions']

export type CommissionDataInvoice =
    | (Invoice & { items: InvoiceItem[] | undefined })
    | undefined
