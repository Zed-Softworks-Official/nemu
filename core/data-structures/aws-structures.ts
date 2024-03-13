/**
 * Locations for AWS Storage
 *
 * @enum {number} Default, Portfolio, Commission, Profile, Store, StoreDownload
 */
export enum AWSLocations {
    Default,
    Portfolio,
    Commission,
    Profile,
    Store,
    Downloads
}

/**
 * Converts the AWS Location Enum to a String for use with the Amazon SDK
 *
 * @param {AWSLocations} location - The desired location of the object
 * @returns {string} The Location in string form for AWS S3
 */
export function AWSLocationEnumToString(location: AWSLocations) {
    switch (location) {
        case AWSLocations.Default:
            return 'Default'
        case AWSLocations.Portfolio:
            return 'Portfolio'
        case AWSLocations.Commission:
            return 'Commission'
        case AWSLocations.Profile:
            return 'Profile'
        case AWSLocations.Store:
            return 'Store'
        case AWSLocations.Downloads:
            return 'Download'
    }
}

/**
 * Converts a string to the correct AWS Location Enum Version for use inside of the application
 *
 * @param {string} location - The desired location of the object
 * @returns {AWSLocations} The location in an AWS Enum for use inside of the application
 */
export function StringToAWSLocationsEnum(location: string) {
    location = location.toLocaleLowerCase()
    switch (location) {
        case 'default':
            return AWSLocations.Default
        case 'portfolio':
            return AWSLocations.Portfolio
        case 'commission':
            return AWSLocations.Commission
        case 'profile':
            return AWSLocations.Profile
        case 'store':
            return AWSLocations.Store
        case 'downloads':
            return AWSLocations.Downloads
    }

    return AWSLocations.Default
}

export interface ImageData {
    signed_url: string
    blur_data: string
    image_key?: string
}