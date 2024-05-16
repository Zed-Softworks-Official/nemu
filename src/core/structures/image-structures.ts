import { UniqueIdentifier } from "@dnd-kit/core"

/**
 * Contains the url for the image as well as the blur data for the placeholder
 */
export type NemuImageData = {
    url: string
    ut_key?: string
    blur_data?: string
}

export type NemuEditImageData = {
    action: 'create' | 'update' | 'delete'
    image_data: {
        url: string
        ut_key?: string
        file_data?: File
    }
}

export type ImageEditorData = {
    id: UniqueIdentifier
    data: NemuEditImageData
}