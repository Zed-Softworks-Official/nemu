export type Sender = {
    user_id: string
    username: string
}

export type Message = {
    id: string
    type: 'text' | 'image'
    sender: Sender
    content: string

    timestamp: number
    reply_to?: Message
}

export type Chat = {
    id: string
    commission_title: string

    messages: Message[]
    users: Sender[]
}
