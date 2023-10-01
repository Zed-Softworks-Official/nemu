/**
 * Gets the Access Token from Auth0 for further use within the application
 * 
 * @returns {Promise<string>} Token Type + The Access Token (Ex. Berear kICtxytHAkEuGCreaP1piS4kwzkis0ddmi99FPmjY8G1ytGxlpEPq23s6vjTirsW...)
 */
export var GetAccessToken = async () => {
    let accessToken = await fetch(process.env.AUTH0_ISSUER_BASE_URL + '/oauth/token', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.AUTH0_M2M_CLIENT_ID!,
            client_secret: process.env.AUTH0_M2M_CLIENT_SECRET!,
            audience: process.env.AUTH0_ISSUER_BASE_URL + '/api/v2/'
        })
    });

    let data = (await accessToken.json());
    return data.token_type + ' ' + data.access_token;
}

/**
 * Gets the full user object from Auth0
 * 
 * @param {string} user_id - Auth0 Id for the user 
 * @returns {Promise<any>} JSON Data from Auth0 containing ALL information on the user requested
 */
export var GetUser = async (user_id: string) => {
    let user = await fetch (process.env.AUTH0_ISSUER_BASE_URL + '/api/v2/users/' + user_id, {
        headers: {
            authorization: await GetAccessToken()
        }
    });

    return (await user.json());
}