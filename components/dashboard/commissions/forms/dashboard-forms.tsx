'use client'

import useSWR from 'swr'
import { GraphQLFetcher } from '@/core/helpers'

import Loading from '@/components/loading'
import Link from 'next/link'
import { PencilSquareIcon } from '@heroicons/react/20/solid'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { ListGraphQLCommissionFormResponse } from '@/core/responses'

export default function DashboardFormsList() {
    const { artistId } = useDashboardContext()
    const { data, isLoading } = useSWR(
        `{
            artist(id:"${artistId}") {
              forms {
                id
                name
                description
              }
            }
          }`,
        GraphQLFetcher<ListGraphQLCommissionFormResponse>
    )

    if (isLoading) {
        return <Loading />
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-3 gap-5">
                {data?.artist.forms?.map((form) => (
                    <div className="card bg-base-100 shadow-xl" key={form.id}>
                        <div className="card-body">
                            <h2 className="card-title">{form.name}</h2>
                            <p>{form.description}</p>
                            <div className="card-actions justify-end pt-5">
                                <Link
                                    className="btn btn-primary"
                                    href={`/dashboard/forms/${form.id}`}
                                >
                                    <PencilSquareIcon className="w-6 h-6" />
                                    Edit
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
