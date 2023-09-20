//import { GetUser } from "./auth0"

////////////////////////////
// Artist Metadata Interface
////////////////////////////
export interface Artist {
    auth0_id: string
    stripe_id: string
    
    handle: string
    store_enabled: boolean
    location: string
    username: string

    about: string
    about_editor: string

    terms: string
    terms_editor: string

    twitter: string
    pixiv: string
    web: string
}


////////////////////////////
// User Interface
////////////////////////////
export interface User {
    user?: {
        object: Record<string, any>
        username: string
        artist: boolean
        picture: string
        admin: boolean
    }
    signed_in: boolean
    dashboard_access: boolean

    artist_object?: Artist
}


////////////////////////////
// Role Enum
////////////////////////////
export enum Role {
    Standard,
    Artist,
    Admin
}


////////////////////////////
// Convert Roles
////////////////////////////
export var RoleEnumToString = (role: Role) => {
    switch (role) {
        case Role.Artist:
            return 'Artist';
        case Role.Admin:
            return 'Admin';
    }

    return '';
}

export var RoleEnumToID = (role: Role) => {
    switch (role) {
        case Role.Artist:
            return 'rol_o9CnU744mXwxbQao';
        case Role.Admin:
            return '';
    }

    return '';
}


// ////////////////////////////
// // Current Artist Check
// ////////////////////////////
// export var IsCurrentUserTheCurrentArtist = (current_user: User, artist_id: string) => {
//     if (!current_user.signed_in || !current_user.user?.artist) {      
//         return false;
//     }

//     return current_user.artist_object?.auth0_id == artist_id ? true : false;
// }


// ////////////////////////////
// // Get Artist Info
// ////////////////////////////
// export var GetArtistInfo = async (artist_id: string) => {
//     var md = new MarkdownIt();

//     var query = await NemuPrismaClient.artist.findFirst({
//         where: {
//             auth0id: artist_id
//         }
//     });

//     var result: Artist = {
//         auth0_id: query!.auth0id,
//         stripe_id: query!.stripeAccId,

//         handle: query!.handle,
//         store_enabled: query!.store,
//         location: query!.location,
//         username: (await GetUser(query!.auth0id)).username,

//         about: md.render(query!.about),
//         about_editor: query!.about,

//         terms: md.render(query!.terms),
//         terms_editor: query!.terms,

//         twitter: query!.twitter,
//         pixiv: query!.pixiv,
//         web: query!.website
//     }

//     return result;
// }


// ////////////////////////////
// // Check If Artists Exists
// ////////////////////////////
// export var ArtistExists = async (artist_handle: string) => {
//     var artist = await NemuPrismaClient.artist.findFirst({
//         where: {
//             handle: artist_handle
//         }
//     })

//     return artist ? true : false;
// }