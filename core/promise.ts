import { NemuResponse, StatusCode } from '@/core/responses'

import { toast } from 'react-toastify'
import { request } from 'graphql-request'

export async function CreateToastPromise(
    promise: Promise<Response>,
    { pending, success }: { pending: string; success: string }
) {
    const id = toast.loading(pending, {
        theme: 'dark'
    })

    const response = await promise
    const data = (await response.json()) as NemuResponse

    if (data.status == StatusCode.Success) {
        toast.update(id, {
            render: success,
            type: 'success',
            autoClose: 5000,
            isLoading: false
        })
    } else {
        toast.update(id, {
            render: data.message,
            type: 'error',
            autoClose: 5000,
            isLoading: false
        })
    }
}
