'use client'

import {
    createContext,
    Dispatch,
    SetStateAction,
    useContext,
    useEffect,
    useState
} from 'react'

import { EndpointHelper, useUploadThing } from '~/components/files/uploadthing'
import { NemuFileRouterType } from '~/app/api/uploadthing/core'
import { ClientUploadedFileData } from 'uploadthing/types'
import { ImageEditorData } from '~/core/structures'

type UploadThingContextType = {
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
    const [images, setImages] = useState<ImageEditorData[]>(edit_previews || [])
    const [uploadProgress, setUploadProgress] = useState(0)

    const { startUpload, permittedFileInfo, isUploading } = useUploadThing(endpoint, {
        onUploadProgress: (p) => {
            setUploadProgress(p)
        }
    })

    const fileTypes = permittedFileInfo?.config
        ? Object.keys(permittedFileInfo?.config)
        : []

    useEffect(() => {
        return () => {
            for (const preview of images) {
                if (preview.data.action  === 'create') {
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

export const useUploadThingContext = () => useContext(UploadThingContext)!
