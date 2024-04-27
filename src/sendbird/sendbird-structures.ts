/**
 * Data for creating a sendbird user
 */
export type SendbirdUserData = {
    user_id: string
    nickname: string
    profile_url?: string
}

/**
 * Data for creating a sendbird channel
 */
export type SendbirdChannelData = {
    name: string
    channel_url: string
    cover_url: string
    data: SendbirdMetadata

    user_ids: string[]
    operator_ids: string[]
    block_sdk_user_channel_join: boolean
    is_distinct: boolean
}

/**
 * Extra data to be stored in a sendbird channel
 */
export type SendbirdMetadata = {
    artist_id: string
    commission_title: string
}
