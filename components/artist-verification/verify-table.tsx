'use client'

import useSwr from 'swr'

// import { Fetcher } from '@/core/helpers'
import { toast } from 'react-toastify'
import Loading from '@/components/loading'


export function VerifyTable() {
    // const { data, isLoading } = useSwr<ArtistVerificationResponse>(
    //     '/api/artist/verify',
    //     Fetcher
    // )

    enum Action {
        Approve = 'approve',
        Reject = 'reject'
    }

    function ConvertMessage(action: Action) {
        switch (action) {
            case Action.Approve:
                return 'Approved'
            case Action.Reject:
                return 'Rejected'
        }
    }

    async function decision(action: Action, userId: string) {
        toast.promise(
            fetch(`/api/artist/${userId}/verify/${action}`, {
                method: 'POST'
            }),
            {
                pending: 'Updating User',
                success: 'User' + ConvertMessage(action),
                error: 'Could not complete request'
            },
            {
                theme: 'dark'
            }
        )
    }

    return (
        <>
            {isLoading ? (
                <Loading />
            ) : (
                <table className="table-fixed w-full">
                    <thead className="bg-primary">
                        <tr>
                            <th className="p-5 rounded-l-xl">Requested Handle</th>
                            <th>Username</th>
                            <th>Socials</th>
                            <th>Location</th>
                            <th className="rounded-r-xl">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="m-5">
                        {data?.artists?.map((artist) => (
                            <tr
                                key={artist.userId}
                                className="border-b border-b-charcoal"
                            >
                                <td className="p-10">{artist.requestedHandle}</td>
                                <td>{artist.username}</td>
                                <td>
                                    <div>
                                        <p>Twitter: {artist.twitter}</p>
                                        <p>Pixiv: {artist.pixiv}</p>
                                    </div>
                                </td>
                                <td>{artist.location}</td>
                                <td>
                                    <div className="text-center">
                                        <button
                                            className="bg-primary hover:bg-primarylight rounded-xl p-5 inline-block mx-5"
                                            onClick={() =>
                                                decision(Action.Approve, artist.userId)
                                            }
                                        >
                                            Approve
                                        </button>
                                        <button
                                            className="bg-error rounded-xl p-5 inline-block"
                                            onClick={() =>
                                                decision(Action.Reject, artist.userId)
                                            }
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </>
    )
}
