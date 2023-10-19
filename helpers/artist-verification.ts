/**
 * Verification Data used to create the artist object
 */
export interface ArtistVerificationData {
    requested_handle: string
    twitter: string
    pixiv: string
    location: string
    user_id: string
}

/**
 * Creates an Artist using an artist code
 * 
 * @param {string} code - The artist code used
 * @param {string} id - The id of the user to become an artist
 * @returns 
 */
export async function ArtistCodeVerification(code: string, id: string, verification_data: ArtistVerificationData) {
    // Check to see if the artist code exists using the api
    let response = await fetch(`/api/artist/code/${code}`, {
        method: 'post'
    });
    
    // Check so see if it's a valid code and return if it doesn't
    let validCode: boolean = (await response.json()).success;
    if (validCode == false) {
        return false;
    }
    
    // Adds Artist Role to User
    let updated = await fetch(`/api/user/${id}/role/Artist`, {
        method: 'post'
    });

    if (!updated) {
        return false
    }

    // Create artist inside database
    let artistCreated = await fetch(`/api/artist/`, {
        method: 'post',
        body: JSON.stringify(verification_data)
    })


    // Send Email to user


    // Delete the code
} 