import { NemuResponse, StatusCode } from '../responses'
import { ArtistVerificationData } from '../structures'

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

    if (((await artist_created.json()) as NemuResponse).status != StatusCode.Success) {
        return false
    }

    // Send Email to user

    // Delete the code
    await fetch(`/api/artist/code/${code}/delete`, {
        method: 'post'
    })

    return true
}
