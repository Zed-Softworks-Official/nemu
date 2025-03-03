import type { UniqueIdentifier } from '@dnd-kit/core'

/**
 * Contains the url for the image as well as the blur data for the placeholder
 */
export type NemuImageData = {
    utKey: string
    blurData?: string
}

export type ClientNemuImageData = {
    url: string
    blurData?: string
}

export type NemuEditImageData = {
    action: 'create' | 'update' | 'delete'
    imageData: {
        url?: string
        utKey?: string
        fileData?: File
    }
}

export type ImageEditorData = {
    id: UniqueIdentifier
    data: NemuEditImageData
}
