'use client'

import { SocialResponse } from '@/core/api/social-response'
import { GraphQLFetcher } from '@/core/helpers'
import { faPixiv, faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { faEarthAmericas } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import useSWR from 'swr'
import SocialsSkeleton from '../skeleton/artist-page/socials-skelton'

export default function ArtistSocials({ artist_id }: { artist_id: string }) {
    const { data, isLoading } = useSWR(
        `{
        artist(id: "${artist_id}") {
          socials {
            agent,
            url
          }
        }
      }`,
        GraphQLFetcher
    )

    function getIcon(agent: string) {
        switch (agent) {
            case 'TWITTER':
                return faXTwitter
            case 'PIXIV':
                return faPixiv
            default:
                return faEarthAmericas
        }
    }

    if (isLoading) {
        return <SocialsSkeleton />
    }

    return (
        <div>
            <div className="divider card-title">Socials</div>
            <div className="flex gap-5 justify-center items-center">
                {(data as SocialResponse).artist?.socials.map((social) => (
                    <Link
                        key={social.agent}
                        href={social.url}
                        className="avatar btn btn-circle btn-ghost rounded-full"
                        target="_blank"
                    >
                        <FontAwesomeIcon
                            icon={getIcon(social.agent)}
                            className="w-6 h-6"
                        />
                    </Link>
                ))}
            </div>
        </div>
    )
}
