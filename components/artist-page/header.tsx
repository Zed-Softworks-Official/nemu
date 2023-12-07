import NemuImage from '../nemu-image'

import ArtistProfileTabs from '@/components/artist-page/tabs'
import { ArtistPageResponse } from '@/helpers/api/request-inerfaces'

export default function ArtistHeader({ data }: { data: ArtistPageResponse }) {
    return (
        <div className="flex-wrap">
            <div className="mx-auto w-full h-96 bg-[url('/curved0.jpg')] rounded-3xl bg-no-repeat bg-center bg-cover"></div>
            <div className="mx-20">
                <div className="mx-auto max-w-[98%] -my-28 py-14 backdrop-blur-xl bg-fullwhite/60 dark:bg-fullblack/60 shadow-lg rounded-3xl px-10">
                    <div className="flex justify-start">
                        <NemuImage
                            src={
                                data.artist?.profilePhoto 
                                    ? data.artist.profilePhoto
                                    : '/profile.png'
                            }
                            alt="Profile Photo"
                            width={100}
                            height={100}
                            className="rounded-3xl ml-10 inline-flex"
                        />
                        <div className="text-left mt-3 px-10">
                            <h2 className="pb-2 font-bold text-2xl">
                                @{data.artist?.handle}
                                <NemuImage src={'/nemu/verified.png'} alt='Verified!' width={40} height={40} className="inline-block ml-5 align-top" />
                            </h2>
                            <h3 className="text-lg">{data.user?.name}</h3>
                        </div>
                    </div>
                    <div className="absolute end-0 top-20 right-60">
                        <ArtistProfileTabs />
                    </div>
                </div>
            </div>
        </div>
    )
}
