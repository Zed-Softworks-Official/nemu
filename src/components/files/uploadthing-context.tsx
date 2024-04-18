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

type UploadThingContextType = {
    files: File[]
    setFiles: Dispatch<SetStateAction<File[]>>

    filePreviews: string[]
    setFilePreviews: Dispatch<SetStateAction<string[]>>

    upload: () => Promise<
        | ClientUploadedFileData<void | {
              uploadedBy: string
              url: string
          }>[]
        | undefined
    >

    uploadProgress: number
    setUploadProgress: Dispatch<SetStateAction<number>>

    isUploading: boolean

    endpoint: EndpointHelper<NemuFileRouterType>
    fileTypes: string[]
}

const UploadThingContext = createContext<UploadThingContextType | null>(null)

export default function UploadThingProvider({
    endpoint,
    children
}: {
    endpoint: EndpointHelper<NemuFileRouterType>
    children: React.ReactNode
}) {
    const [files, setFiles] = useState<File[]>([])
    const [filePreviews, setFilePreviews] = useState<string[]>([])

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
            for (const preview of filePreviews) {
                URL.revokeObjectURL(preview)
            }
        }
    }, [filePreviews])

    async function upload() {
        if (files.length === 0) {
            return
        }

        return await startUpload(files)
    }

    return (
        <UploadThingContext.Provider
            value={{
                files,
                setFiles,
                filePreviews,
                setFilePreviews,
                upload,
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
