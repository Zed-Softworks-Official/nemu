import { env } from '~/env'

export async function sendbird_create_request(
    endpoint: 'users' | 'group_channels',
    endpoint_data: string,
    user_id?: string
) {
    let request_url = `https://api-${env.SENDBIRD_APP_ID}.sendbird.com/v3/${endpoint}`

    if (user_id) {
        request_url += `/${user_id}`
    }

    const responst = await fetch(request_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Api-Token': `${env.SENDBIRD_API_TOKEN}`
        }
    })

    return (await responst.json()) as unknown
}
