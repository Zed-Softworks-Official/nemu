import { type JSONContent } from '@tiptap/react'

import type { CommissionAvailability } from '~/lib/types'

export type CommissionResult = {
    id: string
    title: string
    description: JSONContent
    featuredImage: string
    slug: string
    availability: CommissionAvailability
    price: string
    artist: {
        handle: string
    }
}

export type ProductResult = {
    id: string
    title: string
    description: JSONContent
    featuredImage: string
    price: string
    artist: {
        handle: string
    }
}
