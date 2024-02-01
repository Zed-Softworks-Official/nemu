import { SocialData } from '@/core/structures'
import { faPixiv, faXTwitter } from '@fortawesome/free-brands-svg-icons'
import { faEarthAmericas } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'

export default function ArtistSocials({ socials }: { socials: SocialData[] }) {
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

    return (
        <div>
            <div className="divider card-title">Socials</div>
            <div className="flex gap-5 justify-center items-center">
                {socials.map((social) => (
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
