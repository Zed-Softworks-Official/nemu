import { generateUploadButton, generateUploadDropzone } from '@uploadthing/react'

import type { NemuFileRouterType } from '~/app/api/uploadthing/core'

export const UploadButton = generateUploadButton<NemuFileRouterType>()
export const UploadDropzone = generateUploadDropzone<NemuFileRouterType>()
