import { NemuResponse, StatusCode } from './api/request-inerfaces'

/**
 * Verification Data used to create the artist object
 */
export interface ArtistVerificationData {
    requested_handle: string
    username: string
    twitter: string
    pixiv: string
    location: string
    user_id: string
    profile_photo?: string
}

/**
 * Creates an Artist using an artist code
 *
 * @param {string} code - The artist code used
 * @param {string} id - The id of the user to become an artist
 * @returns
 */
export async function ArtistCodeVerification(
    code: string,
    id: string,
    verification_data: ArtistVerificationData
) {
    // Check to see if the artist code exists using the api
    const code_response = await fetch(`/api/artist/code/${code}`, {
        method: 'post'
    })

    // Check so see if it's a valid code and return if it doesn't
    let validCode: boolean =
        ((await code_response.json()) as NemuResponse).status != StatusCode.Success
    if (validCode == false) {
        return false
    }

    // Adds Artist Role to User
    const role_updated = await fetch(`/api/user/${id}/role/artist`, {
        method: 'post'
    })

    if (((await role_updated.json()) as NemuResponse).status != StatusCode.Success) {
        return false
    }

    // Create artist inside database
    const artist_created = await fetch(`/api/artist`, {
        method: 'post',
        body: JSON.stringify(verification_data)
    })

    if ((((await artist_created.json()) as NemuResponse).status != StatusCode.Success)) {
        return false
    }

    // Send Email to user
    

    // Delete the code
    await fetch(`/api/artist/code/${code}/delete`, {
        method: 'post'
    })

    return true
}

/**
 * Creates an artist using twitter verification
 *
 * @param id - User id for the user to become an artist
 * @param verification_data - The provided by the user for their desired profile
 */
export async function ArtistTwitterVerification(
    id: string,
    verification_data: ArtistVerificationData
) {
    // Create a data object in the database
    const response = await fetch('/api/artist/verify', {
        method: 'post',
        body: JSON.stringify(verification_data)
    })

    // Send Email to user
}
