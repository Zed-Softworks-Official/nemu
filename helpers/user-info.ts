export interface Social {
    agent?: string
    url?: string
}

export enum Role {
    Standard,
    Artist,
    Admin
}

export function RoleEnumToString(role: Role) {
    switch (role) {
        case Role.Artist:
            return 'Artist';
        case Role.Admin:
            return 'Admin';
    }

    return '';
}


export function StringToRoleEnum(role: string) {
    switch (role) {
        case 'Artist':
            return Role.Artist;
    }

    return Role.Standard;
}


export function RoleEnumToID(role: Role) {
    switch (role) {
        case Role.Artist:
            return 'rol_o9CnU744mXwxbQao';
        case Role.Admin:
            return '';
    }
}