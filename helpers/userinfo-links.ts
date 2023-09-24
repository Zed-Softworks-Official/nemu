///////////////////////////////
// Icons
///////////////////////////////
export enum UserInfoIcon {
    Page,
    Dashboard,
    Favourite,
    Messages,
    Settings,

    SignIn,
    SignOut,
}

///////////////////////////////
// User Info Links Interface
///////////////////////////////
export interface UserInfoLink {
    title: string
    path: string
    icon: UserInfoIcon,
}

///////////////////////////////
// User Info
///////////////////////////////

export const UserInfoObject: Record<string, UserInfoLink[]> = {
    SignedOut: [
        {
            title: 'Sign In',
            path: '/api/auth/login',
            icon: UserInfoIcon.SignIn
        }
    ],

    Artist: [
        {
            title: 'My Page',
            path: 'value',
            icon: UserInfoIcon.Page
        },
        {
            title: 'Artist Dashboard',
            path: '/dashboard',
            icon: UserInfoIcon.Dashboard
        },
        {
            title: 'Favourites',
            path: '/favourites',
            icon: UserInfoIcon.Favourite
        },
        {
            title: 'Messages',
            path: '/dashboard/messages',
            icon: UserInfoIcon.Messages
        },
        {
            title: 'Account Settings',
            path: '/dashboard/settings',
            icon: UserInfoIcon.Settings
        },
        {
            title: 'Sign Out',
            path: '/api/auth/logout',
            icon: UserInfoIcon.SignOut
        }
    ],

    Standard: [
        {
            title: 'Messages',
            path: '/dashboard/messages',
            icon: UserInfoIcon.Messages
        },
        {
            title: 'Account Settings',
            path: '/dashboard/settings',
            icon: UserInfoIcon.Settings
        },
        {
            title: 'Sign Out',
            path: '/api/auth/logout',
            icon: UserInfoIcon.SignOut
        }
    ]
}