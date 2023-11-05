///////////////////////////////
// Icons
///////////////////////////////
export enum UserInfoIcon {
    Page,
    Dashboard,
    Favourite,
    Messages,
    Settings,

    Verify,

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
            path: '/api/auth/signin',
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
            path: '/api/auth/signout',
            icon: UserInfoIcon.SignOut
        }
    ],

    Admin: [
        {
            title: 'Verify Artists',
            path: '/artists/verify',
            icon: UserInfoIcon.Verify
        },
        {
            title: 'Favourites',
            path: '/favourites',
            icon: UserInfoIcon.Favourite
        },
        {
            title: 'Account Settings',
            path: '/dashboard/settings',
            icon: UserInfoIcon.Settings
        },
        {
            title: 'Sign Out',
            path: '/api/auth/signout',
            icon: UserInfoIcon.SignOut
        }
    ],

    Standard: [
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
            path: '/api/auth/signout',
            icon: UserInfoIcon.SignOut
        }
    ]
}