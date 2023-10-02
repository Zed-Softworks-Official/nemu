import { PrismaClient } from "@prisma/client";
import { PortfolioItem, ShopItem } from "./request-inerfaces";
import { S3GetSignedURL, StringToAWSLocationsEnum } from "@/helpers/s3";

enum RequestItemEnum {
    None,
    Portfolio,
    Commission,
    Store,
    Profile
}

/**
 * 
 * @param {string} location - The location of the desired object
 * @returns {RequestItemEnum} Location in Enum Form
 */
var StringToRequestItemEnum = (location: string) => {
    switch (location) {
        case 'portfolio':
            return RequestItemEnum.Portfolio
        case 'store':
            return RequestItemEnum.Store
        default:
            return RequestItemEnum.None
    }
}

/**
 * Check the desired location of the item and return the correct item from our database
 * 
 * If the location is an invalid database object, the function returns null
 * 
 * Used for API Methods
 * 
 * @param {string} handle - The artist handle
 * @param {string} location - The location of the desired file
 * @param {string} id - The filename of the destired file
 * @returns An item from the database, Null if location is not inside the database
 */
export var RequestItem = async (handle: string, location: string, id: string) => {
    // Create Null Result
    let result: PortfolioItem | ShopItem | null = null;
    
    // Get the current location we're searching for
    let loc: RequestItemEnum = StringToRequestItemEnum(location);
    // If there is no location in our database for the item then we return null
    if (loc == RequestItemEnum.None) {
        return result;
    }

    // Create Prisma Client
    let prisma = new PrismaClient();
    
    // Fill the result variable with data
    switch (loc) {
        case RequestItemEnum.Portfolio:
            // Determine the location of the object
            let database_item = await prisma.portfolio.findFirst({
                where: {
                    image: id
                }
            });

            result = {
                name: database_item!.name,
                signed_url: await S3GetSignedURL(handle, StringToAWSLocationsEnum(location), id),
                key: id
            };
            break;
        case RequestItemEnum.Store:
            break;
    }

    // Diconnect Prisma
    prisma.$disconnect();

    // Return the result
    return result;
}