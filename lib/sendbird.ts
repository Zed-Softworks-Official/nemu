import { env } from '@/env'
import { SendbirdAPI } from '@/sendbird/sendbird-api'

const globalForSendbird = global as unknown as {
    sendbird: SendbirdAPI
}

export const sendbird =
    globalForSendbird.sendbird ||
    new SendbirdAPI(env.SENDBIRD_APP_ID, env.SENDBIRD_API_TOKEN)

if (env.NODE_ENV !== 'production') globalForSendbird.sendbird = sendbird
