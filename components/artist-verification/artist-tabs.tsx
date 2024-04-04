'use client'

import Image from 'next/image'
import { Tabs } from '../ui/tabs'

export default function ArtistTabs() {
    const tabs = [
        {
            title: 'Commissions',
            value: 'commissions',
            content: (
                <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
                    <p>Commissions Tab</p>
                    <DummyContent />
                </div>
            )
        },
        {
            title: `Artist's Corner`,
            value: 'artist_corner ',
            content: (
                <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
                    <p>Artist's Corner tab</p>
                    <DummyContent />
                </div>
            )
        },
        {
            title: 'Portfolio',
            value: 'portfolio',
            content: (
                <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
                    <p>Portfolio tab</p>
                    <DummyContent />
                </div>
            )
        },
        {
            title: 'Messages',
            value: 'messages',
            content: (
                <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
                    <p>Messages tab</p>
                    <DummyContent />
                </div>
            )
        },
        {
            title: 'Delivery',
            value: 'deliver',
            content: (
                <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
                    <p>Delivery tab</p>
                    <DummyContent />
                </div>
            )
        }
    ]

    return (
        <div className="h-[20rem] md:h-[40rem] [perspective:1000px] relative b flex flex-col max-w-5xl mx-auto w-full  items-start justify-start my-40">
            <Tabs tabs={tabs} absolute />
        </div>
    )
}

const DummyContent = () => {
    return (
        <Image
            src="/nemu/sparkles.png"
            alt="dummy image"
            width="1000"
            height="1000"
            className="object-cover object-left-top h-[60%]  md:h-[90%] absolute -bottom-10 inset-x-0 w-[90%] rounded-xl mx-auto"
        />
    )
}
