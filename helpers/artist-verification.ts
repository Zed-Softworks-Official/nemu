import { GetRoles, GetUser } from "./auth0";
import { Role } from "./user-info";

/**
 * Creates an Artist
 * 
 * @param {string} code - The artist code used
 * @param {string} id - The id of the user to become an artist
 * @returns 
 */
export async function ArtistCodeVerification(code: string, id: string) {
    // Check to see if the artist code exists using the api
    let response = await fetch(`/api/artist/code/${code}`, {
         method: 'post'
    });
    
    // Check so see if it's a valid code and return if it doesn't
    let validCode: boolean = (await response.json()).success;
    if (validCode == false) {
         return false;
    }
    
    // Adds Artist Role in Auth0
    let user = await fetch(`/api/user/info/auth0/${id}/`);
    console.log(await user.json());


    // Create artist inside database


    

    // Send Email to user

} 