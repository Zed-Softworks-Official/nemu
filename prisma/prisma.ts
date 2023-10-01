import { PrismaClient } from "@prisma/client";
import { PrismaArtistInfo, PrismaArtistVerificationInfo, PrismaDeviceInfo, PrismaModel, PrismaPortfolioInfo, PrismaStoreItemInfo } from "./prisma-interface";
import { PrismaCreateArtist, PrismaCreateArtistVerification, PrismaCreateDevice, PrismaCreatePortfolio, PrismaCreateStoreItem } from "./prisma-create";

const prismaClientSingleton = () => {
    return new PrismaClient();
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
}

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

//////////////////////////////////////////
// PrismaCreate
// 
// Adds Objects to Database
//////////////////////////////////////////
export var PrismaCreate = async (prismaModel: PrismaModel, createInfo: PrismaPortfolioInfo | PrismaArtistVerificationInfo | PrismaDeviceInfo | PrismaArtistInfo | PrismaStoreItemInfo ) => {
    switch (prismaModel) {
        case PrismaModel.Portfolio:
            return await PrismaCreatePortfolio(prisma, createInfo as PrismaPortfolioInfo);
        case PrismaModel.ArtistVerification:
            return await PrismaCreateArtistVerification(prisma, createInfo as PrismaArtistVerificationInfo);
        case PrismaModel.Device:
            return await PrismaCreateDevice(prisma, createInfo as PrismaDeviceInfo);
        case PrismaModel.Artist:
            return await PrismaCreateArtist(prisma, createInfo as PrismaArtistInfo);
        case PrismaModel.Store:
            return await PrismaCreateStoreItem(prisma, createInfo as PrismaStoreItemInfo);

    };
};
