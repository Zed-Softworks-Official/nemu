import { env } from '~/env'

import type { GcCreateChannelData } from 'sendbird-platform-sdk-typescript'

import { sendbird } from './index'

/**
 * Creates a new channel on sendbird
 *
 * @param {SendbirdChannelData} channel_data - the data for the channel to be created
 */
export async function create_channel(channel_data: GcCreateChannelData) {
    const channel = await sendbird.chanels.gcCreateChannel(
        env.SENDBIRD_API_TOKEN,
        channel_data
    )

    return channel
}
