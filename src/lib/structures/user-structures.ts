export enum UserRole {
    Standard = 'standard',
    Artist = 'artist',
    Admin = 'admin'
}

export type PrivateUserMetadata = {
    artist_id: string
}

export type ClientUser = {
    id: string
    username: string
    email_address: string
    image_url: string
}
