import { env } from '~/env'

import { sendbird } from './index'
import type { CreateUserData, UpdateUserByIdData } from 'sendbird-platform-sdk-typescript'

/**
 * Creates a new user on sendbird
 *
 */
export async function create_user(user_data: CreateUserData) {
    const user = await sendbird.users.createUser(env.SENDBIRD_API_TOKEN, user_data)

    return user
}

export async function update_user(user_id: string, data: UpdateUserByIdData) {
    await sendbird.users.updateUserById(env.SENDBIRD_API_TOKEN, user_id, data)
}
