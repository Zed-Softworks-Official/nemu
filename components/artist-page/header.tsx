import NemuImage from '../nemu-image'

import ArtistProfileTabs from '@/components/artist-page/tabs'
import { ArtistPageResponse } from '@/core/responses'

export default function ArtistHeader({ data }: { data: ArtistPageResponse }) {
    return (
        <div className="flex flex-wrap flex-1 flex-col">
            <div className="mx-auto w-full h-96 bg-[url('/curved0.jpg')] rounded-xl bg-no-repeat bg-center bg-cover"></div>
            <div className="mx-auto sm:max-w-[85%] w-full -my-28 py-14 backdrop-blur-xl bg-base-300/60 shadow-lg rounded-xl px-10">
                <div className="flex flex-col sm:flex-row justify-between items-center">
                    <div className="flex items-center justify-start">
                        <div className="avatar relative">
                            {data.supporter && (
                                <NemuImage
                                    src={'/nemu/supporter.png'}
                                    alt="Supporter Image"
                                    width={100}
                                    height={100}
                                    className="absolute !w-10 !h-10 top-0 -right-4"
                                />
                            )}
                            <div className="w-24 rounded-full">
                                <NemuImage
                                    src={
                                        data?.user.image
                                            ? data.user.image
                                            : '/profile.png'
                                    }
                                    alt="Profile Photo"
                                    width={200}
                                    height={200}
                                />
                            </div>
                        </div>
                        <div className="text-left mt-3 px-10">
                            <h2 className="pb-2 font-bold text-2xl">@{data?.handle}</h2>
                            <h3 className="text-lg">{data?.user.name}</h3>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <ArtistProfileTabs />
                    </div>
                </div>
            </div>
        </div>
    )
}
