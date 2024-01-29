'use client'

import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import { GraphQLFetcher } from '@/core/helpers'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import useSWR from 'swr'
import * as z from 'zod'

const socialSchema = z.object({
    url: z.string().min(2).max(60),
    agent: z.string().min(2).max(60)
})

type SocialSchemaType = z.infer<typeof socialSchema>

const socialAgents = ['TWITTER', 'PIXIV', 'CUSTOM']

export default function SocialEditor() {
    const { artistId } = useDashboardContext()
    const { data } = useSWR(`{
        artist(id: "${artistId}") {
          socials {
            url
            agent
          }
        }
      }`, GraphQLFetcher)
    const form = useForm<SocialSchemaType>({
        resolver: zodResolver(socialSchema),
        mode: 'onSubmit'
    })

    return (
        <div className="flex flex-col gap-5">
            <div>{JSON.stringify(data)}</div>
            {artistId}
        </div>
    )
}
