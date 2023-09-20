import axios from 'axios';
//axios.defaults;

import { Role, RoleEnumToID, RoleEnumToString } from './user-info';
import { URLSearchParams } from 'url';
import { getAccessToken } from '@auth0/nextjs-auth0';


// ////////////////////////////
// // Get Access Token
// ////////////////////////////
// var GetAccessToken = async () => {
//     var options = {
//         method: 'POST',
//         url: process.env.AUTH0_BASE_URL + '/oauth/token',
//         headers: {'content-type': 'application/x-www-form-urlencoded'},
//         data: new URLSearchParams({
//             grant_type: 'client_credentials',
//             client_id: process.env.AUTH0_M2M_CLIENT_ID!,
//             client_secret: process.env.AUTH0_M2M_CLIENT_SECRET!,
//             audience: process.env.AUTH0_BASE_URL + '/api/v2/'
//         })
//     };

//     var result: string = '';
//     await axios.request(options).then( (response) => {
//         result = response.data.token_type + ' ' + response.data.access_token
//         return result;
//     }).catch( (error) => {
//         console.log(error);
//     });

//     return result;
// }


////////////////////////////
// Get User
////////////////////////////
export var GetUser = async (user_id: string) => {
    var searchQuery = 'user_id:' + user_id;
    var options = {
        method: 'GET',
        url: process.env.AUTH0_BASE_URL + '/api/v2/users',
        params: {q: searchQuery, search_engine: 'v3'},
        headers: {authorization: (await getAccessToken()).accessToken}
    };

    var result: Record<string, any> = [];
    await axios.request(options).then( (response) => {
        result = response.data;
    }).catch((error) => {
       //console.error(error);
    });

    return result;
}

// ////////////////////////////
// // Role Check
// ////////////////////////////
// export var CheckRole = async (role: Role, user_id: string) => {
//     let config = {
//         method: 'GET',
//         maxBodyLength: Infinity,
//         url: process.env.AUTH0_BASE_URL + '/api/v2/users/' + user_id + '/roles',
//         headers: { 
//           'Accept': 'application/json', 
//           'Authorization': await GetAccessToken()
//         }
//     };
      
//     var hasRole = false;

//     await axios.request(config).then((response) => {
//         if (response.data.length != 0) {
//             if (response.data[0].name == RoleEnumToString(role)) {
//                 hasRole = true;
//             }
//         }
//     }).catch((error) => {
//        console.log(error);
//     });

//     return hasRole;
// }


// ////////////////////////////
// // Add Role
// ////////////////////////////
// export var AddRole = async (role: Role, user: string) => {
//     let data = {
//         "roles": [
//             RoleEnumToID(role)
//         ]
//     };

//     let config = {
//         method: 'POST',
//         maxBodyLength: Infinity,
//         url: process.env.AUTH0_BASE_URL + '/api/v2/users/' + user + '/roles',
//         headers: { 
//           'Accept': 'application/json', 
//           'Authorization': await GetAccessToken()
//         },
//         data: data
//     };

//     var roleAdded = false;

//     await axios.request(config).then((response) => {
//         roleAdded = true;
//     })
//     .catch((error) => {
//        console.log(error);
//     });

//     return roleAdded;
// }