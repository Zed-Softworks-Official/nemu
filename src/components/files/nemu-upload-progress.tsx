'use client'

import { useUploadThingContext } from '~/components/files/uploadthing-context'

export default function NemuUploadProgress() {
    const { uploadProgress } = useUploadThingContext()

    return (
        <progress
            className="progress progress-primary w-full"
            value={uploadProgress}
            max={100}
        ></progress>
    )
}
