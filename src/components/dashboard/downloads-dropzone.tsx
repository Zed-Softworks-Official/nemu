'use client'

import { toast } from 'sonner'
import { UploadDropzone } from '~/components/files/uploadthing'
import { Button } from '../ui/button'

export default function DownloadsDropzone(props: {
    commission_id: string
    request_id: string
}) {
    return (
        <Button
            onMouseDown={() => {
                toast.success('Download Uploaded!')
            }}
        >
            Click Me
        </Button>
        // <UploadDropzone
        //     endpoint="commissionDownloadUploader"
        //     className="cursor-pointer ut-button:bg-primary ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-button:active:scale-95 ut-allowed-content:italic ut-allowed-content:text-base-content/80 ut-label:text-primary ut-upload-icon:text-base-content ut-ready:border-2 ut-ready:border-base-content/60  ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out ut-ready:hover:border-primary"
        //     onClientUploadComplete={() => {
        //         toast.success('Download Uploaded!')
        //     }}
        // />
    )
}
