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


//////////////////////////////////////////
// Artist Interface
//////////////////////////////////////////
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
