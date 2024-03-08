export enum ChatStatus {
    Failed,
    Delivered,
    Sent,
    Read,
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
    message_type: ChatMessageType | undefined

    sent_timestamp: Date
}

export interface MessagePreview {
    channel_name: string
    other_username: string
    channel_url: string

    unread_messages: boolean
    last_message?: string
    late_message_timestamp?: Date
    last_message_current_user: boolean
}