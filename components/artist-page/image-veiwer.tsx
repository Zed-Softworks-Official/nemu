'use client'

import { ImageData } from '@/core/structures'
import { useState } from 'react'
import NemuImage from '../nemu-image'

export default function ImageViewer({ featured_image, additional_images }: { featured_image: ImageData; additional_images?: ImageData[] }) {
    const [currentImage, setCurrentImage] = useState(featured_image)
    const [loadingNewImage, setLoadingNewImage] = useState(false)

    return (
        <div>
            <div className="relative overflow-auto rounded-xl">
                {loadingNewImage && (
                    <div className="absolute w-full h-full backdrop-blur-2xl top-0 left-0">
                        <div className="flex justify-center items-center h-full">
                            <span className="loading loading-spinner loading-lg"></span>
                        </div>
                    </div>
                )}
                <NemuImage
                    src={!currentImage ? featured_image.signed_url! : currentImage.signed_url}
                    placeholder="blur"
                    blurDataURL={!currentImage ? featured_image.blur_data! : currentImage.blur_data}
                    width={1000}
                    height={1000}
                    loading="lazy"
                    alt={'Featured Image'}
                    className="rounded-xl"
                />
            </div>
            <div className="flex flex-wrap gap-3 my-5 justify-evenly">
                <div className="overflow-hidden rounded-xl cursor-pointer aspect-square transition-all duration-150 scale-100 hover:scale-110">
                    <NemuImage
                        src={featured_image.signed_url}
                        blurDataURL={featured_image.blur_data}
                        placeholder="blur"
                        width={100}
                        height={100}
                        alt={'Featured Image'}
                        onClick={() => setCurrentImage(featured_image)}
                    />
                </div>
                {additional_images?.map((image: ImageData) => (
                    <div className="overflow-hidden rounded-xl cursor-pointer aspect-square transition-all duration-150 scale-100 hover:scale-110">
                        <NemuImage
                            key={image.image_key}
                            src={image.signed_url}
                            placeholder="blur"
                            blurDataURL={image.blur_data}
                            width={100}
                            height={100}
                            alt={'Additional Images'}
                            onClick={() => setCurrentImage(image)}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
