import { PrismaClient } from "@prisma/client";
import { PrismaArtistInfo, PrismaArtistVerificationInfo, PrismaDeviceInfo, PrismaModel, PrismaPortfolioInfo, PrismaStoreItemInfo } from "./prisma-interface";
import { PrismaCreateArtist, PrismaCreateArtistVerification, PrismaCreateDevice, PrismaCreatePortfolio, PrismaCreateStoreItem } from "./prisma-create";

export const NemuPrismaClient = new PrismaClient();

//////////////////////////////////////////
// PrismaCreate
// 
// Adds Objects to Database
//////////////////////////////////////////
export var PrismaCreate = async (prismaModel: PrismaModel, createInfo: PrismaPortfolioInfo | PrismaArtistVerificationInfo | PrismaDeviceInfo | PrismaArtistInfo | PrismaStoreItemInfo ) => {
    switch (prismaModel) {
        case PrismaModel.Portfolio:
            return await PrismaCreatePortfolio(NemuPrismaClient, createInfo as PrismaPortfolioInfo);
        case PrismaModel.ArtistVerification:
            return await PrismaCreateArtistVerification(NemuPrismaClient, createInfo as PrismaArtistVerificationInfo);
        case PrismaModel.Device:
            return await PrismaCreateDevice(NemuPrismaClient, createInfo as PrismaDeviceInfo);
        case PrismaModel.Artist:
            return await PrismaCreateArtist(NemuPrismaClient, createInfo as PrismaArtistInfo);
        case PrismaModel.Store:
            return await PrismaCreateStoreItem(NemuPrismaClient, createInfo as PrismaStoreItemInfo);
    };
};
