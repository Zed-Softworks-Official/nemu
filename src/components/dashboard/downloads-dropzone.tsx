'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { UploadDropzone } from '~/components/files/uploadthing'
import { api } from '~/trpc/react'

export default function DownloadsDropzone(props: {
    request_id: string
    user_id: string
}) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    const mutation = api.downloads.set_download.useMutation({
        onMutate: () => {
            toast.loading('Creating Download', {
                id: toastId
            })
        },
        onSuccess: () => {
            toast.success('Download Created!', {
                id: toastId
            })
        },
        onError: () => {
            toast.error('Failed to create download!', {
                id: toastId
            })
        }
    })

    return (
        <UploadDropzone
            endpoint="commissionDownloadUploader"
            className="cursor-pointer ut-button:bg-primary ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-button:active:scale-95 ut-allowed-content:italic ut-allowed-content:text-base-content/80 ut-label:text-primary ut-upload-icon:text-base-content ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out ut-ready:hover:border-primary"
            onClientUploadComplete={(res) => {
                mutation.mutate({
                    ...props,
                    ut_key: res[0]?.key!,
                    url: res[0]?.url!
                })
            }}
            onUploadBegin={() => {
                setToastId(toast.loading('Uploading File'))
            }}
        />
    )
}
