import { Role } from './data-structures/user-structures'

/**
 * Converts a given role to a string
 *
 * @param {Role} role - The role to convert to a string
 * @returns {string} The string version of the role
 */
export function RoleEnumToString(role: Role) {
    switch (role) {
        case Role.Artist:
            return 'Artist'
        case Role.Admin:
            return 'Admin'
        case Role.Standard:
            return 'Standard'
        default:
            return 'Standard'
    }
}

/**
 * Converts a given role from a string into an enumeration
 *
 * @param {string} role - The role in string form
 * @returns {role} The role as an enum
 */
export function StringToRoleEnum(role: string) {
    switch (role) {
        case 'Artist':
            return Role.Artist
        case 'Admin':
            return Role.Admin
        default:
            return Role.Standard
    }
}