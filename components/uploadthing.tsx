import { NemuFileRouter } from '@/app/api/uploadthing/core'
import { generateUploadButton, generateUploadDropzone } from '@uploadthing/react'

export const UploadButton = generateUploadButton<NemuFileRouter>()
export const UploadDropzone = generateUploadDropzone<NemuFileRouter>()
