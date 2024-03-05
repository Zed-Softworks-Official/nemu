export interface SendbirdUserData {
    user_id: string
    nickname: string
    profile_url?: string
}

export interface SendbirdChannelData {
    name: string
    channel_url: string
    cover_url: string

    user_ids: string[]
    operator_ids: string[]
    block_sdk_user_channel_join: boolean
    is_distinct: boolean
}