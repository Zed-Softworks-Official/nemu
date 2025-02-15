'use client'

import { ReactQRCode, type ReactQRCodeRef } from '@lglab/react-qr-code'
import { notFound, useParams } from 'next/navigation'
import { useRef } from 'react'

import { Button } from '~/components/ui/button'
import Loading from '~/components/ui/loading'

import { api } from '~/trpc/react'

export default function QrPage() {
    const ref = useRef<ReactQRCodeRef>(null)
    const { id } = useParams()
    if (!id) {
        return notFound()
    }

    const con = api.con.get_con.useQuery({ id: id as string })

    const handle_download = () => {
        ref.current?.download({
            name: `${con.data?.name}-qr`,
            format: 'png',
            size: 1024
        })
    }

    if (con.isLoading) return <Loading />

    if (!con.data?.slug || !con.data?.name) {
        return notFound()
    }

    return (
        <div className="container mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center gap-4">
            <h1 className="text-2xl font-bold">Con: {con.data.name}</h1>

            <ReactQRCode
                ref={ref}
                value={`https://nemu.art/cons/${con.data.slug}`}
                size={1024}
                imageSettings={{
                    src: '/profile.png',
                    width: 300,
                    height: 300,
                    excavate: true
                }}
                dataModulesSettings={{
                    color: '#fff'
                }}
                finderPatternInnerSettings={{
                    color: '#fff'
                }}
                finderPatternOuterSettings={{
                    color: '#fff'
                }}
            />
            <Button onClick={handle_download}>Download</Button>
        </div>
    )
}
