////////////////////////////////////////////////////////
// Artist Metadata Interface
////////////////////////////////////////////////////////
export interface Artist {
    auth0_id: string
    stripe_id: string

    handle: string
    store_enabled: string
    location: string
    username: string

    about: string
    about_editor: string

    terms: string
    terms_editor: string

    twitter: string
    pixiv: string
    website: string
}

////////////////////////////////////////////////////////
// User Metadata Interface
////////////////////////////////////////////////////////
export interface User {
    user?: {
        username: string
        artist: boolean
        admin: boolean
    }

    signed_in: boolean
    dashboard_access: boolean

    artist_object?: Artist
}