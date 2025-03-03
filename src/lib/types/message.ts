export type Sender = {
    userId: string
    username: string
}

export type Message = {
    id: string
    type: 'text' | 'image'
    sender: Sender
    content: string

    timestamp: number
    replyTo?: Message
}

export type Chat = {
    id: string
    commissionTitle: string

    messages: Message[]
    users: Sender[]
}
