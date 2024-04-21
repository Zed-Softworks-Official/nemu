'use client'

import { useState } from 'react'

import NemuImage from '~/components/nemu-image'
import { NemuImageData } from '~/core/structures'

import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, FreeMode, Thumbs } from 'swiper/modules'
import { Swiper as SwiperType } from 'swiper/types'

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/free-mode'
import 'swiper/css/thumbs'

export default function ImageViewer({ images }: { images: NemuImageData[] }) {
    const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null)

    return (
        <div className="flex flex-col gap-5">
            <div>
                <Swiper
                    navigation
                    loop
                    thumbs={{
                        swiper:
                            thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null
                    }}
                    modules={[FreeMode, Navigation, Thumbs]}
                    className="rounded-xl h-full w-full max-w-[35rem]"
                >
                    {images?.map((image, index) => (
                        <SwiperSlide key={index}>
                            <NemuImage
                                src={image.url}
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
                {images?.map((image, index) => (
                    <SwiperSlide key={index}>
                        <NemuImage
                            src={image.url}
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
