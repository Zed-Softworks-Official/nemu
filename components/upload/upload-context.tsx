'use client'

import { AWSAction, AWSData, FileUploadData, UploadResponse } from '@/core/structures'
import {
    QueryClient,
    QueryClientProvider,
    useMutation,
    UseMutationResult
} from '@tanstack/react-query'
import axios, { AxiosResponse } from 'axios'
import { createContext, Dispatch, SetStateAction, useContext, useState } from 'react'

/**
 *
 */
type OnSuccessFn = (res: UploadResponse) => void

/**
 *
 */
type OnErrorFn = (e: Error) => void

/**
 *
 */
type OnMutateFn = (awsData: FormData) => void

/**
 *
 */
type UploadContextType = {
    uploadMutation: UseMutationResult<AxiosResponse<any, any>, Error, FormData, void>
    upload: () => void

    files: FileUploadData[] | null
    setFiles: Dispatch<SetStateAction<FileUploadData[] | null>>

    filePreviews: string[] | null
    setFilePreviews: Dispatch<SetStateAction<string[] | null>>

    onSuccess: OnSuccessFn | null
    setOnSuccess: Dispatch<SetStateAction<OnSuccessFn | null>>

    onError: OnErrorFn | null
    setOnError: Dispatch<SetStateAction<OnErrorFn | null>>

    onMutate: OnMutateFn | null
    setOnMutate: Dispatch<SetStateAction<OnMutateFn | null>>
}

/**
 *
 */
const UploadContext = createContext<UploadContextType | undefined>(undefined)

/**
 *
 */
const queryClient = new QueryClient()

/**
 *
 * @param
 * @returns
 */
export function GenerateAWSData(files: FileUploadData[]) {
    const awsData = new FormData()
    for (const upload_data of files) {
        // Generate Metadata
        const file_metadata: FileUploadData = {
            key: crypto.randomUUID(),
            aws_data: {
                uploaded_by: upload_data.aws_data.uploaded_by,
                endpoint: upload_data.aws_data.endpoint,
                action: upload_data.aws_data.action
                    ? upload_data.aws_data.action
                    : AWSAction.Upload
            }
        }

        // Append data
        awsData.append('files', upload_data.file!, file_metadata.key)
        awsData.append(file_metadata.key, JSON.stringify(file_metadata))
    }

    return awsData
}

/**
 *
 */
function UploadProvider_INTERNAL({ children }: { children: React.ReactNode }) {
    const [files, setFiles] = useState<FileUploadData[] | null>(null)
    const [filePreviews, setFilePreviews] = useState<string[] | null>(null)

    const [onSuccess, setOnSuccess] = useState<OnSuccessFn | null>(null)
    const [onError, setOnError] = useState<OnErrorFn | null>(null)
    const [onMutate, setOnMutate] = useState<OnMutateFn | null>(null)

    const uploadMutation = useMutation({
        mutationFn: (awsData: FormData) => {
            return axios.post('/api/aws', awsData)
        },
        onSuccess: (res) => {
            if (onSuccess) {
                onSuccess(res.data as UploadResponse)
            }
        },
        onError: (e) => {
            if (onError) {
                onError(e)
            }
        },
        onMutate: (variables) => {
            if (onMutate) {
                onMutate(variables)
            }
        }
    })

    /**
     *
     */
    const upload = () => {
        if (!files) return

<<<<<<< Updated upstream
        uploadMutation.mutate(GenerateAWSData(files))
=======
        
>>>>>>> Stashed changes
    }

    return (
        <UploadContext.Provider
            value={{
                files,
                setFiles,
                filePreviews,
                setFilePreviews,
                onSuccess,
                setOnSuccess,
                onError,
                setOnError,
                onMutate,
                setOnMutate,
                uploadMutation,
                upload
            }}
        >
            {children}
        </UploadContext.Provider>
    )
}

/**
 *
 */
export default function UploadProvider({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <UploadProvider_INTERNAL>{children}</UploadProvider_INTERNAL>
        </QueryClientProvider>
    )
}

/**
 *
 */
export const useUploadContext = () => useContext(UploadContext)
