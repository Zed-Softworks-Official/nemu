import { PrismaClient} from "@prisma/client";
import { PrismaArtistVerificationInfo, PrismaPortfolioInfo, PrismaDeviceInfo, PrismaArtistInfo, PrismaStoreItemInfo } from "./prisma-interface";


//////////////////////////////////////////
// Create Portfolio Item
//////////////////////////////////////////
export var PrismaCreatePortfolio = async (client: PrismaClient, createInfo: PrismaPortfolioInfo) => {
    return await client.portfolio.create({
        data: {
            auth0id: createInfo.auth0id,
            image: createInfo.image,
            name: createInfo.name
        }
    });
}


//////////////////////////////////////////
// Create Artist Verification
//////////////////////////////////////////
export var PrismaCreateArtistVerification = async (client: PrismaClient, createInfo: PrismaArtistVerificationInfo) => {
    return await client.artistVerification.create({
        data: {
            auth0id: createInfo.auth0id,
            requestedHandle: createInfo.requestedHandle,
            username: createInfo.username,
            twitter: createInfo.twitter,
            pixiv: createInfo.pixiv,
            location: createInfo.location
        }
    });
}


//////////////////////////////////////////
// Create Device
//////////////////////////////////////////
export var PrismaCreateDevice = async (client: PrismaClient, createInfo: PrismaDeviceInfo) => {
    return await client.device.create({
        data: {
            auth0id: createInfo.auth0id,
            browser: createInfo.browser,
            os: createInfo.os,
            platform: createInfo.platform,
            ip: createInfo.ip,
            location: createInfo.location,
            isDesktop: createInfo.isDesktop,
            isMobile: createInfo.isMobile
        }
    });
}


//////////////////////////////////////////
// Create Artist
//////////////////////////////////////////
export var PrismaCreateArtist = async (client: PrismaClient, createInfo: PrismaArtistInfo) => {
    return await client.artist.create({
        data: {
            auth0id: createInfo.auth0id,
            stripeAccId: createInfo.stripeAccId,

            handle: createInfo.handle,
            about: createInfo.about,
            terms: createInfo.terms,
            location: createInfo.location,
            store: createInfo.store,

            twitter: createInfo.twitter,
            pixiv: createInfo.pixiv,
            website: createInfo.website,

            headerPhoto: createInfo.headerPhoto,
            profilePhoto: createInfo.profilePhoto
        }
    });
}



//////////////////////////////////////////
// Create Store Item
//////////////////////////////////////////
export var PrismaCreateStoreItem = async (client: PrismaClient, createInfo: PrismaStoreItemInfo) => {
    return await client.storeItem.create({
        data: {
            auth0id: createInfo.auth0id,
            product: createInfo.product,
            stripeAccId: createInfo.stripeAccId
        }
    });
}