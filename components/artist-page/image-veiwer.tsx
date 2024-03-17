'use client'

import { ImageData } from '@/core/structures'
import { useState } from 'react'
import NemuImage from '../nemu-image'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, FreeMode, Thumbs } from 'swiper/modules'
import { Swiper as SwiperType } from 'swiper/types'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/free-mode'
import 'swiper/css/thumbs'

export default function ImageViewer({ featured_image, additional_images }: { featured_image: ImageData; additional_images?: ImageData[] }) {
    const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null)

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Swiper
                    navigation
                    loop
                    thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
                    modules={[FreeMode, Navigation, Thumbs]}
                    className="rounded-xl h-full w-full max-w-[35rem]"
                >
                    <SwiperSlide>
                        <div className="flex h-full w-full items-center justify-center">
                            <NemuImage
                                src={featured_image.signed_url!}
                                placeholder="blur"
                                blurDataURL={featured_image.blur_data!}
                                width={800}
                                height={800}
                                alt={'Featured Image'}
                                className="block w-full h-full object-cover"
                            />
                        </div>
                    </SwiperSlide>
                    {additional_images?.map((image: ImageData, index) => (
                        <SwiperSlide key={index}>
                            <NemuImage
                                src={image.signed_url}
                                alt="Image"
                                placeholder="blur"
                                blurDataURL={image.blur_data}
                                width={800}
                                height={800}
                                className="block w-full h-full object-cover"
                            />
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>
            <Swiper
                onSwiper={setThumbsSwiper}
                loop
                spaceBetween={12}
                slidesPerView={4}
                freeMode
                watchSlidesProgress
                modules={[FreeMode, Navigation, Thumbs]}
                className="thumbs h-full w-full max-w-[35rem] "
            >
                <SwiperSlide>
                    <NemuImage
                        src={featured_image.signed_url!}
                        placeholder="blur"
                        blurDataURL={featured_image.blur_data!}
                        width={200}
                        height={200}
                        alt={'Featured Image'}
                        className="block w-full h-full object-cover rounded-xl cursor-pointer transition-all scale-100 duration-150 hover:scale-105"
                    />
                </SwiperSlide>
                {additional_images?.map((image: ImageData, index) => (
                    <SwiperSlide key={index}>
                        <NemuImage
                            src={image.signed_url}
                            alt="Image"
                            placeholder="blur"
                            blurDataURL={image.blur_data}
                            width={200}
                            height={200}
                            className="block w-fit h-fit object-cover rounded-xl cursor-pointer transition-all scale-100 duration-150 hover:scale-105"
                        />
                    </SwiperSlide>
                ))}
            </Swiper>
        </div>
    )
}
