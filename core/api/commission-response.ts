import { CommissionItem } from '../data-structures/response-structures'
import { NemuResponse } from './base-response'

import { FormSubmission, Form } from '@prisma/client'
import { FormElementInstance } from '@/components/form-builder/elements/form-elements'

/**
 * FormResponses
 *
 */
export interface FormResponses {
    username: string
    userId: string

    createdAt: Date
    content: string
}

/**
 * CommissionResponse
 *
 */
export interface CommissionResponse extends NemuResponse {
    commission?: CommissionItem
    commissions?: CommissionItem[]
}

/**
 * CommissionFormsResponse
 *
 */
export interface CommissionFormsResponse extends NemuResponse {
    form?: Form & { formSubmissions: FormSubmission[] }
    forms?: Form[]
    formContent?: FormElementInstance[]

    submitted?: boolean
}

/**
 * CommissionFormsSubmissionViewResponse
 *
 */
export interface CommissionFormsSubmissionViewResponse extends NemuResponse {
    name?: string
    description?: string

    submissions?: number

    responses?: FormResponses[]
    form_labels?: FormElementInstance[]
}
