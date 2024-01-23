/**
 * Social Media Places Available To Use
 * 
 * Twitter, Pixiv, YouTube, Website
 */
export enum SocialAgent {
    Twitter,
    Pixiv,
    YouTube,
    Website
}

/**
 * Interface for socail media
 * 
 * @prop {string | undefined} agent - The social network
 * @prop {string | undefined} url - The url to the social network  
 */
export interface Social {
    agent: SocialAgent
    url: string
}

/**
 * Roles available to each user
 * 
 * Standard, Artist, Admin
 */
export enum Role {
    Standard,
    Artist,
    Admin
}

/**
 * UserInfoIcons
 */
export enum UserInfoIcon {
    Page,
    Dashboard,
    Favourite,
    Messages,
    Settings,

    Verify,
    Code,

    SignIn,
    SignOut,
}

/**
 * UserInfoLink Interface
 */
export interface UserInfoLink {
    title: string
    path: string
    icon: UserInfoIcon,
}


///////////////////////////////
// User Info Model
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
        }
    ],

    Admin: [
        {
            title: 'Generate Artist Code',
            path: '/artists/verify/generate',
            icon: UserInfoIcon.Code
        },
        {
            title: 'Verify Artists',
            path: '/artists/verify',
            icon: UserInfoIcon.Verify
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