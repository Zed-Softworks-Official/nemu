//////////////////////////////////////////
// Prisma Model
//////////////////////////////////////////
export enum PrismaModel {
    None,
    Portfolio,
    Store,
    Artist,
    ArtistVerification,
    Device
}

export function StringToPrismaModelEnum(location: string) {
    switch (location) {
        case 'portfolio':
            return PrismaModel.Portfolio;
        case 'store':
            return PrismaModel.Store;
        case 'artist':
            return PrismaModel.Artist;
        case 'artistverification':
            return PrismaModel.ArtistVerification;
        case 'device':
            return PrismaModel.Device;
        default:
            return PrismaModel.None;
    }
}


//////////////////////////////////////////
// Artist Portfolio Interface
//////////////////////////////////////////
export interface PrismaPortfolioInfo {
    auth0id: string
    image: string
    name: string
}


//////////////////////////////////////////
// Artist Verification Interface
//////////////////////////////////////////
export interface PrismaArtistVerificationInfo {
    auth0id: string
    requestedHandle: string
    username: string
    twitter: string
    pixiv: string
    location: string
}


//////////////////////////////////////////
// Device Interface
//////////////////////////////////////////
export interface PrismaDeviceInfo {
    auth0id: string
    browser: string
    os: string
    platform: string
    ip: string
    location: string
    isDesktop: boolean
    isMobile: boolean
}


/**
 * Artist Interface for prisma
 * 
 * @prop {string} auth0id - Auth0 Id of the artist
 * @prop {string} stripeAccId - The Stripe Id for the artist if there is one
 * 
 * @prop {string} handle - The handle of the artist
 * @prop {string} about - The artists about section
 * @prop {string} terms - The terms and conditions for the artist
 * @prop {string} location - The location of the artist
 * @prop {boolean} store - If the store is turned on for the artist
 * 
 * @prop {string} twitter - Twitter url for the artist
 * @prop {string} pixiv - Pixiv url for the artist
 * @prop {string} website - Website url for the artist
 * 
 * @prop {string} headerPhoto - The header photo key for the artists page header
 * @prop {string} profilePhoto - The profile photo key for the artist
 */
export interface PrismaArtistInfo {
    auth0id: string
    stripeAccId: string

    handle: string
    about: string
    terms: string
    location: string
    store: boolean

    twitter: string
    pixiv: string
    website: string
    
    headerPhoto: string
    profilePhoto: string
}


//////////////////////////////////////////
// Store Interface
//////////////////////////////////////////
export interface PrismaStoreItemInfo {
    auth0id: string
    product: string
    stripeAccId: string
}
