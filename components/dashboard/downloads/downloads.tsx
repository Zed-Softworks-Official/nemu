'use client'

import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'

import Loading from '@/components/loading'
import { DownloadsResponse } from '@/core/responses'
import NemuImage from '@/components/nemu-image'
import { useSession } from 'next-auth/react'
import { DownloadData } from '@/core/structures'
import Link from 'next/link'

export default function DownloadsList() {
    const { data: session } = useSession()

    const { data, isLoading } = useSWR(
        `{
            user(id: "${session?.user.user_id}") {
                downloads {
                    download_url
                    created_at
                    receipt_url
                    artist_handle
                }
            }
        }`,
        GraphQLFetcher<DownloadsResponse>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <>
            {data?.user?.downloads.length != 0 ? (
                <div className="overflow-x-auto w-full bg-base-100 overflow-hidden rounded-xl">
                    <table className="table table-zebra w-full rounded-xl">
                        <thead>
                            <tr>
                                <th>Artist</th>
                                <th>Date Received</th>
                                <th>Receipt</th>
                                <th>Download</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.user?.downloads.map((download: DownloadData) => (
                                <tr>
                                    <th>{download.artist_handle}</th>
                                    <td>{new Date(download.created_at).toLocaleDateString()}</td>
                                    {download.receipt_url ? (
                                        <td>
                                            <Link href={download.receipt_url} className="btn btn-outline" target="_blank">
                                                Receipt
                                            </Link>
                                        </td>
                                    ) : (
                                        <td></td>
                                    )}
                                    <td>
                                        <Link href={download.download_url} className="btn btn-primary" download target="_blank" rel="noreferrer">
                                            Download
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex flex-col justify-center items-center w-full h-full gap-5">
                    <NemuImage src={'/nemu/sad.png'} alt="Nemu Sad" width={200} height={200} priority />
                    <h2 className="card-title">You have no downloads yet</h2>
                </div>
            )}
        </>
    )
}
