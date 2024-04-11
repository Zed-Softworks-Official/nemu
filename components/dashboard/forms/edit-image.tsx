'use client'

import NemuImage from '@/components/nemu-image'
import { AWSFileModification } from '@/core/data-structures/form-structures'
import { Trash2Icon } from 'lucide-react'

export default function EditImage({
    image,
    setImages,
    images,
    index
}: {
    image: AWSFileModification
    images?: AWSFileModification[]
    setImages: (images: AWSFileModification[] | undefined) => void
    index: number
}) {
    function DeleteImage() {
        const newImages = [...images!]
        newImages.splice(index, 1)
        setImages(newImages)
    }

    return (
        <>
            {image.signed_url && (
                <div className="rounded-xl cursor-pointer overflow-hidden">
                    <div className="relative">
                        <NemuImage src={image.signed_url} alt="image" width={200} height={200} className="w-full" />
                        <div className="absolute top-0 w-full h-full opacity-0 transition-opacity duration-200 hover:opacity-100">
                            <div className="bg-base-300/80 h-full w-full flex flex-col justify-center gap-5 items-center">
                                <h2 className="card-title">{image.file_name!}</h2>
                                <button
                                    type="button"
                                    className="btn btn-error"
                                    onClick={() => {
                                        DeleteImage()
                                    }}
                                >
                                    <Trash2Icon className="2-6 h-6" />
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
