'use client'

import { toast } from 'sonner'

import { UploadDropzone } from '~/components/files/uploadthing'

export default function UpdateHeaderDropzone() {
    return (
        <UploadDropzone
            endpoint="headerPhotoUploader"
            className="w-full ut-button:bg-primary ut-button:transition-all ut-button:duration-200 ut-button:ease-in-out ut-button:active:scale-95 ut-allowed-content:italic ut-allowed-content:text-base-content/80 ut-label:text-base-content ut-ready:border-2 ut-ready:border-base-content/60 ut-ready:bg-base-100 ut-ready:transition-all ut-ready:duration-200 ut-ready:ease-in-out ut-ready:hover:border-primary"
            onClientUploadComplete={(res) => {
                if (!res) {
                    toast.error('Failed to update header photo!')

                    return
                }

                toast.success('Header photo updated!')
            }}
        />
    )
}
