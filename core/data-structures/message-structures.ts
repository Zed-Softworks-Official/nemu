export enum ChatStatus {
    Failed,
    Delivered,
    Seen,
}

export enum ChatMessageType {
    Text,
    Image,
    Admin
}

export interface ChatMessage {
    username: string
    profile_photo: string
    message?: string
    signed_url?: string

    status: ChatStatus
    message_type: ChatMessageType

    sent_timestamp: Date
    seen_timestamp?: Date
}

export interface MessagePreview {
    other_username: string
    last_message: string
    late_message_timestamp: Date
    last_message_current_user: boolean
}