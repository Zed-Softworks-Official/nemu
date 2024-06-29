import { env } from '~/env'
import SendbirdChat from '@sendbird/chat'
import { GroupChannelModule, type SendbirdGroupChat } from '@sendbird/chat/groupChannel'

type SendbirdUserData = {
    user_id: string
    nickname: string
    profile_url?: string
}

type SendbirdChannelData = {
    name: string
    channel_url: string
    cover_url: string
    data: SendbirdMetadata

    user_ids: string[]
    operator_ids: string[]
    block_sdk_user_channel_join: boolean
    is_distinct: boolean
}

export type SendbirdMetadata = {
    artist_id: string
    commission_title: string
}

const globalForSendbird = global as unknown as {
    sendbird: SendbirdGroupChat
}

const sendbird = SendbirdChat.init({
    appId: env.SENDBIRD_APP_ID,
    modules: [new GroupChannelModule()]
}) as SendbirdGroupChat

if (env.NODE_ENV !== 'production') globalForSendbird.sendbird = sendbird

/**
 * Creates a new user on sendbird
 *
 * @param {SendbirdUserData} user_data - the user data for the user to be created on sendbird
 */
export async function create_user(user_data: SendbirdUserData) {
    const response = await fetch(
        `https://api-${env.SENDBIRD_APP_ID}.sendbird.com/v3/users`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf8',
                Authorization: `Bearer ${env.SENDBIRD_API_TOKEN}`
            },
            body: JSON.stringify(user_data)
        }
    )

    const json = (await response.json()) as unknown

    return json
}

/**
 * Creates a new channel on sendbird
 *
 * @param {SendbirdChannelData} channel_data - the data for the channel to be created
 */
export async function create_channel(channel_data: SendbirdChannelData) {
    const channel = await sendbird.groupChannel.createChannel({
        name: channel_data.name,
        coverUrl: channel_data.cover_url,
        data: JSON.stringify(channel_data.data),
        isDistinct: channel_data.is_distinct,
        invitedUserIds: channel_data.user_ids,
        operatorUserIds: channel_data.operator_ids
    })

    return channel
}
