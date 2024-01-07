'use client'

import { CommissionFormsResponse } from '@/helpers/api/request-inerfaces'
import { fetcher } from '@/helpers/fetcher'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'

export default function FormBuilder({ form_id }: { form_id: string }) {
    const { data: session } = useSession()
    const { data } = useSWR<CommissionFormsResponse>(
        `/api/artist/${session?.user.user_id}/forms/${form_id}`, fetcher
    )

    return (<h1>{data?.form?.name}</h1>)
}
