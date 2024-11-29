import {
    generateUploadButton,
    generateUploadDropzone,
    generateReactHelpers
} from '@uploadthing/react'

import type { FileRouter } from 'uploadthing/types'
import type { NemuFileRouterType } from '~/app/api/uploadthing/core'

/**
 * Enddpoint helper for creating upload things later on
 */
export type EndpointHelper<TRouter extends void | FileRouter> = void extends TRouter
    ? 'YOU FORGOT TO PASS THE GENERIC'
    : keyof TRouter

/**
 * Basic Uploadthing button
 */
export const UploadButton = generateUploadButton<NemuFileRouterType>()

/**
 * Basic Uploadthing Dropzone
 */
export const UploadDropzone = generateUploadDropzone<NemuFileRouterType>()

/**
 * Create React Helpers
 */
export const { useUploadThing, uploadFiles } = generateReactHelpers<NemuFileRouterType>()
