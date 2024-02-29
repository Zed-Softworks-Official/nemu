import { CommissionItem } from '../data-structures/response-structures'
import { NemuResponse } from './base-response'

import { FormSubmission, Form } from '@prisma/client'
import { FormElementInstance } from '@/components/form-builder/elements/form-elements'
import { AWSFileModification } from '../data-structures/form-structures'
import { KanbanContainerData, KanbanTask } from '../structures'

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
 * 
 */
export interface GraphQLCommissionFormResponse {
    form?: Form 
}

/**
 * 
 */
export interface ListGraphQLCommissionFormResponse {
    artist: {
        forms: {
            id: string
            name: string
            description: string
        }[]
    }
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
    containers?: KanbanContainerData[]
    tasks?: KanbanTask[]
}