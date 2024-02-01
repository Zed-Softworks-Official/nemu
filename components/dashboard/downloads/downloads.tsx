'use client'

import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'
import { useSession } from 'next-auth/react'

import Link from 'next/link'
import Loading from '@/components/loading'
import { DownloadsResponse } from '@/core/responses'
import { DownloadData } from '@/core/structures'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import NemuImage from '@/components/nemu-image'

export default function DownloadsList() {
    const { userId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            user(id: "${userId}") {
                purchased {
                    price
                    name
                    download_url
                    artist_handle
                }
            }
        }`,
        GraphQLFetcher
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {(data as DownloadsResponse).user?.purchased.length != 0 ? (
                <div className="overflow-x-auto w-full rounded-xl">
                    <table className="table table-zebra">
                        <thead className=" bg-base-200">
                            <th>Item Name</th>
                            <th>Artist</th>
                            <th>Price</th>
                            <th>Download</th>
                        </thead>
                        <tbody>
                            {(data as DownloadsResponse).user?.purchased.map(
                                (download: DownloadData) => (
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
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex flex-col justify-center items-center w-full h-full gap-5">
                    <NemuImage
                        src={'/nemu/sad.png'}
                        alt="Nemu Sad"
                        width={200}
                        height={200}
                        priority
                    />
                    <h2 className='card-title'>You have no downloads yet</h2>
                </div>
            )}
        </>
    )
}
