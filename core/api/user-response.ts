import { User } from '@prisma/client'

import { DownloadData } from '../data-structures/response-structures'
import { NemuResponse } from './base-response'

/**
 * UserResponse
 * Handles information about the user
 *
 * @prop {User | null | undefined} info - The information on the user
 */
export interface UserResponse extends NemuResponse {
    info?: User | null
}

/**
 * DownloadsResponse
 * Handles distribution of Download data
 *
 * @prop {DownloadData[] | undefined} downloads - The data of the downloads
 */
export interface DownloadsResponse extends NemuResponse {
    downloads?: DownloadData[]
}
