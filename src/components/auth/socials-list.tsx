'use client'

import { useState } from 'react'
import { SocialAccount, SocialAgent } from '~/core/structures'
import { Button } from '~/components/ui/button'
import { PlusCircleIcon, Trash2Icon } from 'lucide-react'
import { Input } from '~/components/ui/input'

export default function SocialsList(props: {
    socials: SocialAccount[]
    onSocialsChange: (socials: SocialAccount[]) => void
}) {
    const [socials, setSocials] = useState(props.socials)
    const [currentUrl, setCurrentUrl] = useState('')

    return (
        <div className="flex w-full flex-col gap-5">
            <h2 className="label">Socials:</h2>
            {socials.map((account, i) => (
                <div
                    key={account.url}
                    className="flex flex-row items-center justify-between gap-5 rounded-xl bg-base-200 px-5 py-2"
                >
                    <span>{account.url}</span>
                    <Button
                        variant={'ghost'}
                        type="button"
                        onMouseDown={() => {
                            setSocials((prev) => {
                                return prev.filter((_, index) => index !== i)
                            })
                        }}
                    >
                        <Trash2Icon className="h-6 w-6" />
                    </Button>
                </div>
            ))}
            <div className="join w-full">
                <Input
                    placeholder="Website url"
                    className="join-item w-full"
                    onChange={(e) => setCurrentUrl(e.currentTarget.value)}
                />
                <Button
                    variant={'ghost'}
                    type="button"
                    className="join-item bg-base-200"
                    onMouseDown={() => {
                        if (socials.length + 1 > 3) {
                            return
                        }

                        if (!/^(ftp|http|https):\/\/[^ "]+$/.test(currentUrl)) {
                            return
                        }

                        let agent: SocialAgent = SocialAgent.Website
                        if (
                            currentUrl.includes('x.com') ||
                            currentUrl.includes('twitter.com')
                        ) {
                            agent = SocialAgent.Twitter
                        } else if (currentUrl.includes('pixiv.net')) {
                            agent = SocialAgent.Pixiv
                        }

                        setSocials([
                            ...socials,
                            {
                                agent,
                                url: currentUrl
                            }
                        ])

                        props.onSocialsChange(socials)
                    }}
                >
                    <PlusCircleIcon className="h-6 w-6" />
                </Button>
            </div>
        </div>
    )
}
