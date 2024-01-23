'use client'

import useSWR from 'swr'
import { Fetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'

import { DownloadsResponse } from '@/core/responses'
import Link from 'next/link'
import Loading from '@/components/loading'

export default function DownloadsList() {
    const { data: session } = useSession()
    const { data, isLoading } = useSWR<DownloadsResponse>(
        `/api/user/${session?.user.user_id}/downloads`,
        Fetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="overflow-x-auto w-full rounded-xl">
            <table className="table table-zebra">
                <thead className=" bg-base-200">
                    <th>Item Name</th>
                    <th>Artist</th>
                    <th>Price</th>
                    <th>Download</th>
                </thead>
                <tbody>
                    {data?.downloads?.map((download) => (
                        <tr key={download.name}>
                            <td>{download.name}</td>
                            <td>{download.artist}</td>
                            <td>${download.price}</td>
                            <td>
                                <Link
                                    href={download.url}
                                    className="btn btn-primary"
                                    download
                                >
                                    Download
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
