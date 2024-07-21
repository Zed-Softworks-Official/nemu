import { env } from '~/env'

import { sendbird } from './index'
import type { CreateUserData, UpdateUserByIdData } from 'sendbird-platform-sdk-typescript'

/**
 * Creates a new user on sendbird
 *
 * @param {CreateUserData} user_data - The data to create the user with
 */
export async function create_user(user_data: CreateUserData) {
    const user = await sendbird.users.createUser(env.SENDBIRD_API_TOKEN, user_data)

    return user
}

/**
 * Updates a user on sendbird
 *
 * @param {string} user_id - The user id of the user to update
 * @param {UpdateUserByIdData} data - The data to update the user with
 */
export async function update_user(user_id: string, data: UpdateUserByIdData) {
    await sendbird.users.updateUserById(env.SENDBIRD_API_TOKEN, user_id, data)
}
