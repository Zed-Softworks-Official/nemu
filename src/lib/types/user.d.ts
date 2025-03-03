export const userRoles = ['standard', 'artist', 'admin'] as const
export type UserRole = (typeof userRoles)[number]

export interface NemuPublicUserMetadata {
    role: UserRole
    handle?: string
    artistId?: string
}
