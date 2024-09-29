import { env } from '~/env'
import * as sb from 'sendbird-platform-sdk-typescript'

const init_sendbird = () => {
    const configuration = sb.createConfiguration({
        baseServer: new sb.ServerConfiguration(
            `https://api-${env.SENDBIRD_APP_ID}.sendbird.com`,
            {
                app_id: env.SENDBIRD_APP_ID
            }
        )
    })

    return {
        users: new sb.UserApi(configuration),
        channels: new sb.GroupChannelApi(configuration)
    }
}

const globalForSendbird = global as unknown as {
    sendbird: {
        users: sb.UserApi
        channels: sb.GroupChannelApi
    }
}

export const sendbird = globalForSendbird.sendbird || init_sendbird()

if (env.NODE_ENV !== 'production') globalForSendbird.sendbird = sendbird

export * from './users'
export * from './channels'
export * from './types'
