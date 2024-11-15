import { sendbird_create_request } from './index'

type SendbirdCreateChannelData = {
    users_ids: string[]
    name: string
    cover_url: string
    channel_url: string
    operator_ids: string[]
    block_sdk_user_channel_join: boolean
    is_distinct: boolean
    data: string
}

/**
 * Creates a new channel on sendbird
 *
 * @param {SendbirdChannelData} channel_data - the data for the channel to be created
 */
export async function create_channel(channel_data: SendbirdCreateChannelData) {
    return await sendbird_create_request('group_channels', JSON.stringify(channel_data))
}
