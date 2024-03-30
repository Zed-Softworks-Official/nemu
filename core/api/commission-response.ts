import { CommissionItem } from '../data-structures/response-structures'
import { NemuResponse, RouterOutput } from './base-response'

import { FormSubmission, Form } from '@prisma/client'
import { FormElementInstance } from '@/components/form-builder/elements/form-elements'
import { AWSFileModification } from '../data-structures/form-structures'
import { KanbanContainerData, KanbanTask } from '../structures'

export type CommissionsResponse = RouterOutput['commissions']['get_commission']
export type CommissionEditableResponse = RouterOutput['commissions']['get_commission_editable']

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
export interface CommissionFormsResponse {
    forms: {
        id: string
        name: string
        description: string
    }[]
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

export interface CommissionFormCreateResponse extends NemuResponse {
    form_id: string
}

export interface CommissionImagesResponse extends NemuResponse {
    images?: AWSFileModification[]
}

export interface KanbanResponse extends NemuResponse {
    id?: string,
    containers?: KanbanContainerData[]
    tasks?: KanbanTask[]
}