import { SendbirdChannelData, SendbirdUserData } from '~/sendbird/sendbird-structures'

// TODO: Access Token/Session Tokens so shit doesn't go wrong
export class SendbirdAPI {
    private m_APIToken: string
    private m_BaseURL: string

    constructor(app_id: string, api_token: string) {
        this.m_APIToken = api_token

        this.m_BaseURL = `https://api-${app_id}.sendbird.com/v3`
    }

    /**
     *
     * @param request_path
     * @param data
     */
    private async BasePOSTRequest(
        request_path: 'users' | 'group_channels',
        data: SendbirdUserData | SendbirdChannelData
    ) {
        const response = await fetch(`${this.m_BaseURL}/${request_path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf8',
                'Api-Token': this.m_APIToken
            },
            body: JSON.stringify(data)
        })
        const json = await response.json()

        console.log(JSON.stringify(json))
        return json
    }

    /**
     *
     * @param user_data
     */
    async CreateUser(user_data: SendbirdUserData) {
        this.BasePOSTRequest('users', user_data)
    }

    /**
     *
     * @param channel_data
     */
    async CreateGroupChannel(channel_data: SendbirdChannelData) {
        return this.BasePOSTRequest('group_channels', channel_data)
    }

    /**
     *
     */
    async CreateMessage() {}
}
