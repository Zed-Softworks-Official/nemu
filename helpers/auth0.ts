
//////////////////////////////////////////
// Get Access Token from Auth0
//////////////////////////////////////////
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


//////////////////////////////////////////
// Get User Data from Auth0
//////////////////////////////////////////
export var GetUser = async (user_id: string) => {
    let user = await fetch (process.env.AUTH0_ISSUER_BASE_URL + '/api/v2/users/' + user_id, {
        headers: {
            authorization: await GetAccessToken()
        }
    });

    return (await user.json());
}