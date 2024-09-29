import { sendbird_create_request } from './index'
// import type { CreateUserData, UpdateUserByIdData } from 'sendbird-platform-sdk-typescript'

type CreateUserData = {
    user_id: string
    nickname: string
    profile_url: string
}

type UpdateUserData = {
    nickname?: string
    profile_url?: string
}

/**
 * Creates a new user on sendbird
 *
 * @param {CreateUserData} user_data - The data to create the user with
 */
export async function create_user(user_data: CreateUserData) {
    return await sendbird_create_request('users', JSON.stringify(user_data))
}

/**
 * Updates a user on sendbird
 *
 * @param {string} user_id - The user id of the user to update
 * @param {UpdateUserData} user_data - The data to update the user with
 */
export async function update_user(user_id: string, user_data: UpdateUserData) {
    return await sendbird_create_request('users', JSON.stringify(user_data), user_id)
}
