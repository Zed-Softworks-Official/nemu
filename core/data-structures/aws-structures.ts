import { NemuResponse, StatusCode } from '../responses'

/**
 * Locations for AWS Storage
 *
 * @enum {number} Default, Portfolio, Commission, Profile, Store, StoreDownload
 */
export enum AWSEndpoint {
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
 * @param {AWSEndpoint} endpoint - The desired location of the object
 * @returns {string} The Location in string form for AWS S3
 */
export function AWSLocationEnumToString(endpoint: AWSEndpoint) {
    switch (endpoint) {
        case AWSEndpoint.Default:
            return 'Default'
        case AWSEndpoint.Portfolio:
            return 'Portfolio'
        case AWSEndpoint.Commission:
            return 'Commission'
        case AWSEndpoint.Profile:
            return 'Profile'
        case AWSEndpoint.Store:
            return 'Store'
        case AWSEndpoint.Downloads:
            return 'Download'
    }
}

/**
 * Converts a string to the correct AWS Location Enum Version for use inside of the application
 *
 * @param {string} location - The desired location of the object
 * @returns {AWSEndpoint} The location in an AWS Enum for use inside of the application
 */
export function StringToAWSLocationsEnum(endpoint: string) {
    endpoint = endpoint.toLocaleLowerCase()
    switch (endpoint) {
        case 'default':
            return AWSEndpoint.Default
        case 'portfolio':
            return AWSEndpoint.Portfolio
        case 'commission':
            return AWSEndpoint.Commission
        case 'profile':
            return AWSEndpoint.Profile
        case 'store':
            return AWSEndpoint.Store
        case 'downloads':
            return AWSEndpoint.Downloads
    }

    return AWSEndpoint.Default
}

/**
 * @prop {string} signed_url - The signed url generated by AWS
 * @prop {string} blur_data - The blur data for image
 * @prop {image_key | undefined} image_key - The AWS key
 */
export interface ImageData {
    signed_url: string
    blur_data: string
    image_key?: string
}

export enum AWSAction {
    Upload,
    Delete,
    Update
}

export enum AWSMimeType {
    Image = 'image/png,image/jpeg,image/gif',
    Video = 'video/mp4,video/mov',
    Zip = 'application/zip'
}

export interface AWSData {
    endpoint: AWSEndpoint
    uploaded_by: string
    action: AWSAction
}

export type FileUploadData = {
    key: string
    aws_data: AWSData
    id?: string
    featured?: boolean,
    file?: File
}

export type UploadProps = {
    accept: AWSMimeType[]
    endpoint: AWSEndpoint
    uploaded_by: string
    auto_upload?: boolean
    max_files?: number
    action?: AWSAction
    on_success?: (res: UploadResponse) => void
    on_error?: (e: Error) => void,
    on_mutate?: (variables: FormData) => void,
    
    containerClassnames?: string
}

export interface UploadResponse {
    signed_url?: string
}

export interface UploadError {
    code: StatusCode,
    message?: string
}
