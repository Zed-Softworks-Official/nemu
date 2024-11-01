'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { UploadDropzone } from '~/components/files/uploadthing'
import { set_download } from '~/server/actions/downloads'

export default function DownloadsDropzone(props: {
    request_id: string
    user_id: string
}) {
    const [toastId, setToastId] = useState<string | number | undefined>(undefined)

    return (
        <UploadDropzone
            endpoint="commissionDownloadUploader"
            className="cursor-pointer ut-button:bg-primary ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-button:active:scale-95 ut-allowed-content:italic ut-allowed-content:text-base-content/80 ut-label:text-primary ut-upload-icon:text-base-content ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out ut-ready:hover:border-primary"
            onUploadError={(e) => {
                toast.error(JSON.stringify(e), {
                    id: toastId
                })
            }}
            onClientUploadComplete={async (res) => {
                const downlaod_response = await set_download({
                    ...props,
                    ut_key: res[0]!.key,
                    url: res[0]!.url
                })

                if (!downlaod_response.success) {
                    toast.error('Failed to upload file!', {
                        id: toastId
                    })

                    return
                }

                toast.success('Download Created!', {
                    id: toastId
                })
            }}
            onUploadBegin={() => {
                setToastId(toast.loading('Uploading File'))
            }}
        />
    )
}
