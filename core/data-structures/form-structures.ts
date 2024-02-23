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