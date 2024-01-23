import { ArtistVerificationData } from "../structures"

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