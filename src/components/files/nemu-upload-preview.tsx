'use client'

import Container from '~/components/ui/container'

import { useUploadThingContext } from '~/components/files/uploadthing-context'
import NemuImage from '~/components/nemu-image'

export default function NemuUploadPreview() {
    const { filePreviews } = useUploadThingContext()

    if (filePreviews.length === 0) {
        return (
            <Container variant={'muted'}>
                <h2 className="card-title">No image uploaded yet</h2>
            </Container>
        )
    }

    if (filePreviews.length === 1) {
        return (
            <div className="card shadow-xl">
                <figure>
                    <NemuImage
                        src={filePreviews[0]!}
                        alt="Image Preview"
                        className="w-full h-full"
                        width={200}
                        height={200}
                    />
                </figure>
            </div>
        )
    }

    return <>Not Implmented</>
}
