import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    PutObjectCommandInput,
    S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AWSLocations, AWSLocationEnumToString } from './data-structures/aws-structures'

const client = new S3Client({ region: 'us-west-1' })

/**
 * Creates a random name with the given file extension
 *
 * @param { File } file - File to generate the name of
 * @param { string[] } accepted - File types accepted
 * @returns a string with a random name and the file extension
 */
export function RandomNameWithExtension(file: File, accepted?: string[]) {
    // Check if we have a specific accepted value
    if (accepted) {
        let accepted_file = false
        for (let i = 0; i < accepted.length; i++) {
            if (file.type == accepted[i]) {
                accepted_file = true
                break
            }
        }

        if (!accepted_file) {
            return 'invalid'
        }

        // Check if file is of that type
        return crypto.randomUUID() + '.zip'
    }

    // Return File name with extension type
    return crypto.randomUUID()
}

/**
 * Takes in the handle, location, and file_key of a file and converts it into a single string to be used with the AWS SDK
 *
 * @param {string} handle - The handle of the artist
 * @param {AWSLocations} location - The desired location for the content
 * @param {string} file_key - The name of the file
 * @returns {string} A string with all three paramaters combined into an AWS Key
 */
export function AsKey(artist_id: string, location: AWSLocations, file_key: string) {
    return artist_id + '/' + AWSLocationEnumToString(location) + '/' + file_key
}

/**
 * Uploads a file to AWS S3
 *
 * @param {string} artist_id - The id of the artist
 * @param {AWSLocations} location - The desired location to place it
 * @param {File} file - The file requested to upload
 * @param {string} filename - The filename to be used with AWS S3
 * @returns {Promise<PutObjectCommandOutput>} A promise determining wether the upload failed or succedded
 */
export async function S3Upload(
    artist_id: string,
    location: AWSLocations,
    file: File,
    filename: string
) {
    const uploadParams: PutObjectCommandInput = {
        Bucket: 'nemuart',
        Body: Buffer.from(await file.arrayBuffer()),
        Key: AsKey(artist_id, location, filename),
        ContentLength: file.size
    }

    var command = new PutObjectCommand(uploadParams)

    return await client.send(command)
}

/**
 * Gets a file from AWS S3 and returns a presigned URL to the client for the client to view/get the object
 *
 * @param {string} artist_id - The handle of the artist
 * @param {AWSLocations} location - The desired location to find the object
 * @param {string} key - The filename of the object
 * @returns {Promise<string>} A promise containing a string which is a signed url to the object the user requested
 */
export async function S3GetSignedURL(
    artist_id: string,
    location: AWSLocations,
    key: string
) {
    const downloadParams = {
        Bucket: 'nemuart',
        Key: AsKey(artist_id, location, key)
    }

    var command = new GetObjectCommand(downloadParams)

    return await getSignedUrl(client, command, { expiresIn: 3600 })
}

/**
 * Deletes a file from AWS S3
 *
 * @param {string} artist_id - The handle of the artist
 * @param {AWSLocations} location - The desired location to find the object
 * @param {string} key - The filename within AWS S3
 * @returns {Promise<DeleteObjectCommandOutput>} A promise contains whether the object was successfully deleted or not
 */
export async function S3Delete(artist_id: string, location: AWSLocations, key: string) {
    const deleteParams = {
        Bucket: 'nemuart',
        Key: AsKey(artist_id, location, key)
    }

    var command = new DeleteObjectCommand(deleteParams)

    return await client.send(command)
}