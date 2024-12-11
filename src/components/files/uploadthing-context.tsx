'use client'

import {
    createContext,
    type Dispatch,
    type SetStateAction,
    useContext,
    useEffect,
    useState
} from 'react'

import { generatePermittedFileTypes } from 'uploadthing/client'

import { type EndpointHelper, useUploadThing } from '~/components/files/uploadthing'
import { type NemuFileRouterType } from '~/app/api/uploadthing/core'
import { type ClientUploadedFileData } from 'uploadthing/types'
import { type ImageEditorData } from '~/core/structures'

type EditorState = {
    create: ImageEditorData[]
    update: ImageEditorData[]
    delete: ImageEditorData[]
}

type UploadThingContextType = {
    editData: EditorState
    setEditData: Dispatch<SetStateAction<EditorState>>

    images: ImageEditorData[]
    setImages: Dispatch<SetStateAction<ImageEditorData[]>>

    uploadImages: () => Promise<ClientUploadedFileData<null>[] | undefined>

    uploadProgress: number
    setUploadProgress: Dispatch<SetStateAction<number>>

    isUploading: boolean

    endpoint: EndpointHelper<NemuFileRouterType>
    fileTypes: string[]
}

const UploadThingContext = createContext<UploadThingContextType | null>(null)

export default function UploadThingProvider({
    endpoint,
    edit_previews,
    children
}: {
    endpoint: EndpointHelper<NemuFileRouterType>
    edit_previews?: ImageEditorData[]
    children: React.ReactNode
}) {
    const [editData, setEditData] = useState<EditorState>({
        create: [],
        update: [],
        delete: []
    })

    const [images, setImages] = useState<ImageEditorData[]>(edit_previews ?? [])
    const [uploadProgress, setUploadProgress] = useState(0)

    const { startUpload, routeConfig, isUploading } = useUploadThing(endpoint, {
        onUploadProgress: (p) => {
            setUploadProgress(p)
        }
    })

    const fileTypes = generatePermittedFileTypes(routeConfig).fileTypes

    useEffect(() => {
        return () => {
            for (const preview of images) {
                if (preview.data.action === 'create') {
                    URL.revokeObjectURL(preview.data.image_data.url)
                }
            }
        }
    }, [images])

    async function uploadImages() {
        if (images.length === 0) {
            return
        }

        return await startUpload(images.map((image) => image.data.image_data.file_data!))
    }

    return (
        <UploadThingContext.Provider
            value={{
                editData,
                setEditData,
                images,
                setImages,
                uploadImages,
                endpoint,
                fileTypes,
                uploadProgress,
                setUploadProgress,
                isUploading
            }}
        >
            {children}
        </UploadThingContext.Provider>
    )
}

export function useNemuUploadThing() {
    const context = useContext(UploadThingContext)

    if (!context) {
        throw new Error('useUploadThingContext must be used within a UploadThingProvider')
    }

    return context
}
