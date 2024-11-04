'use client'

import { SaveIcon, PlusCircleIcon } from 'lucide-react'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { toast } from 'sonner'

import { type SocialAccount, SocialAgent } from '~/core/structures'

import { Card, CardHeader, CardTitle, CardContent } from '~/components/ui/card'
import { Textarea } from '~/components/ui/textarea'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Button } from '~/components/ui/button'

import SelectCountries from '~/components/ui/select-countries'
import UpdateHeaderDropzone from '~/components/dashboard/settings/update-header'
import { update_artist_settings } from '~/server/actions/artist-settings'

export default function ClientSettingsForm(props: {
    artist_data: {
        about: string
        location: string
        terms: string
        tip_jar_url: string | undefined
        socials: SocialAccount[]
    }
}) {
    const [fieldChanged, setFieldChanged] = useState<boolean>(false)
    const [state, formAction] = useFormState(update_artist_settings, { success: false })

    useEffect(() => {
        if (state.success) {
            toast.success('Artist Settings Updated!')
        }

        if (state.errors) {
            for (const e of state.errors) {
                toast.error(e.message)
            }
        }
    }, [state])

    return (
        <form action={formAction} className="flex flex-col gap-5">
            <Card>
                <CardHeader className="flex flex-col items-center justify-between sm:flex-row">
                    <CardTitle>Artist Settings</CardTitle>
                    <SubmitButton fieldChanged={fieldChanged} />
                </CardHeader>
                <CardContent className="container mx-auto max-w-6xl">
                    <div className="form-control">
                        <Label className="label">Header Photo</Label>
                        <UpdateHeaderDropzone />
                    </div>
                    <div className="divider"></div>
                    <div className="form-control">
                        <Label className="label">About:</Label>
                        <Textarea
                            name="about"
                            defaultValue={props.artist_data?.about}
                            placeholder="About"
                            rows={8}
                            className="resize-none"
                            onChange={() => setFieldChanged(true)}
                        />
                    </div>
                    <div className="divider"></div>
                    <div className="form-control">
                        <Label className="label">Terms &amp; Conditions:</Label>
                        <Textarea
                            name="terms"
                            defaultValue={props.artist_data?.terms}
                            placeholder="Terms &amp; Conditions"
                            rows={8}
                            className="resize-none"
                            onChange={() => setFieldChanged(true)}
                        />
                    </div>
                    <div className="divider"></div>
                    <div className="form-control">
                        <Label className="label">Location:</Label>
                        <SelectCountries
                            name="location"
                            defaultValue={props.artist_data?.location}
                            onValueChange={() => setFieldChanged(true)}
                        />
                    </div>
                    <div className="divider"></div>
                    <div className="form-control">
                        <Label className="label">Tip Jar URL:</Label>
                        <Input
                            placeholder="Tip Jar URL"
                            name="tip_jar_url"
                            defaultValue={props.artist_data?.tip_jar_url}
                            onChange={() => setFieldChanged(true)}
                        />
                    </div>
                    <div className="divider"></div>
                    <SocialsList
                        socials={props.artist_data?.socials}
                        onFieldChange={setFieldChanged}
                    />
                </CardContent>
            </Card>
        </form>
    )
}

function SocialsList(props: {
    socials: SocialAccount[]
    onFieldChange: (value: boolean) => void
}) {
    const [socials, setSocials] = useState(props.socials)
    const [currentUrl, setCurrentUrl] = useState('')

    return (
        <div className="form-control rounded-xl bg-base-300 p-5 shadow-lg">
            <div className="flex flex-row items-center justify-between">
                <Label className="label">Socials:</Label>
            </div>
            <div className="flex flex-col gap-5">
                {socials.map((social) => (
                    <SocialInput
                        key={social.agent}
                        social={social}
                        setSocials={setSocials}
                    />
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

                            props.onFieldChange(true)
                        }}
                    >
                        <PlusCircleIcon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

function SocialInput(props: {
    social: SocialAccount
    setSocials: Dispatch<SetStateAction<SocialAccount[]>>
}) {
    return (
        <Input
            name="socials"
            type="text"
            placeholder="Website url"
            defaultValue={props.social.url}
        />
    )
}

function SubmitButton(props: { fieldChanged: boolean }) {
    const { pending } = useFormStatus()

    return (
        <Button
            type="submit"
            disabled={pending || !props.fieldChanged}
            className="btn-wide"
        >
            <SaveIcon className="h-6 w-6" />
            Save
        </Button>
    )
}
