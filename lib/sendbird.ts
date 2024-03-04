import { SendbirdAPI } from '@/sendbird/sendbird-api'

const globalForSendbird = global as unknown as {
    sendbird: SendbirdAPI
}

export const sendbird = globalForSendbird.sendbird || new SendbirdAPI(process.env.SENDBIRD_APP_ID, process.env.SENDBIRD_API_TOKEN)

if (process.env.NODE_ENV !== 'production') globalForSendbird.sendbird = sendbird
