import React from "react"
import { RouterOutput } from "../responses"

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

export interface UserInfoItem {
    icon: React.ReactNode
    title: string
    url: string
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

export type AccountSettingsResponse = RouterOutput['user']['get_user']


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
            title: 'Favorites',
            path: '/favorites',
            icon: UserInfoIcon.Favourite
        },
        {
            title: 'Messages',
            path: '/messages',
            icon: UserInfoIcon.Messages
        },
        {
            title: 'Account Settings',
            path: '/account',
            icon: UserInfoIcon.Settings
        },
        {
            title: 'Sign Out',
            path: '/api/auth/signout',
            icon: UserInfoIcon.SignOut
        }
    ]
}

export interface SocialData {
    url: string
    agent: string
}