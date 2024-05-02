export enum UserRole {
    Standard,
    Artist,
    Admin
}

export type PublicUserMetadata = {
    role: UserRole
    has_sendbird_account: boolean
    
    handle?: string
}

export type PrivateUserMetadata = {
    artist_id: string
}