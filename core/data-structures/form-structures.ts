import { AWSLocations } from "./aws-structures"

export interface CreateFormSubmissionStructure {
    user_id: string
    form_id: string
    content: string
}

export enum CommissionStatus {
    WaitingApproval,
    Accepted,
    Rejected
}

export enum AWSMoficiation {
    Added,
    Removed
}

export interface AWSFileModification {
    file_key: string
    aws_location: AWSLocations
    signed_url?: string
    file_name?: string
    featured?: boolean

    modification?: AWSMoficiation
    updated_file?: File
    blob?: string
}