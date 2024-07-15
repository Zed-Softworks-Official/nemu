'use client'

import { useFormState } from 'react-dom'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { verify_artist } from '~/server/actions/verification'

import { Input } from '~/components/ui/input'
import { FormItem } from '~/components/ui/form'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import { Label } from '~/components/ui/label'
import { VerificationMethod } from '~/core/structures'
import SelectCountries from '~/components/ui/select-countries'

import { toast } from 'sonner'
import SubmitButton from '~/components/artist-verification/submit-button'

export default function ArtistApplyForm() {
    const [verificationMethod, setVerificationMethod] = useState<
        VerificationMethod | undefined
    >(undefined)
    const [state, formAction] = useFormState(verify_artist, { success: false })

    const router = useRouter()

    useEffect(() => {
        if (state.success && state.error === undefined) {
            toast.success('Verification Successful')

            router.replace('/artists/apply/success')
        } else if (!state.success && state.error !== undefined) {
            toast.error(state.error)
        }
    }, [state, router])

    return (
        <form action={formAction} className="flex w-full flex-col gap-5">
            <FormItem className="form-control">
                <Label className="label">Requested Handle*:</Label>
                <Input placeholder="@handle" name="requested_handle" />
            </FormItem>
            <FormItem>
                <Label className="label">Twitter URL*:</Label>
                <Input
                    placeholder="https://twitter.com/username"
                    name="twitter"
                    className="w-full"
                />
            </FormItem>
            <FormItem>
                <Label className="label">Website URL:</Label>
                <Input
                    placeholder="https://myawesome.portfolio"
                    name="website"
                    className="w-full"
                />
            </FormItem>
            <FormItem>
                <Label className="label">Location*:</Label>
                <SelectCountries name="location" />
            </FormItem>
            <div className="divider"></div>
            <FormItem>
                <Label className="label">Verification Method*:</Label>
                <RadioGroup
                    name="method"
                    onValueChange={(value) =>
                        setVerificationMethod(value as VerificationMethod)
                    }
                >
                    <div className="flex items-center gap-2">
                        <RadioGroupItem
                            value={VerificationMethod.Code}
                            id={VerificationMethod.Code}
                        />
                        <Label htmlFor={VerificationMethod.Code}>Artist Code</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <RadioGroupItem
                            value={VerificationMethod.Twitter}
                            id={VerificationMethod.Twitter}
                        />
                        <Label htmlFor={VerificationMethod.Twitter}>Twitter</Label>
                    </div>
                </RadioGroup>
            </FormItem>
            <div className="divider"></div>
            <div className="flex min-h-40 w-full flex-col items-center justify-center">
                <VerificationStep verificationMethod={verificationMethod} />
            </div>
            <div className="divider"></div>
            <SubmitButton verification_method={verificationMethod} />
        </form>
    )
}

function VerificationStep(props: { verificationMethod?: VerificationMethod }) {
    if (!props.verificationMethod) return <p>Please select a verification method</p>

    if (props.verificationMethod === VerificationMethod.Code) {
        return (
            <FormItem className="w-full">
                <Label className="label">Artist Code</Label>
                <Input
                    placeholder="Paste Code Here!"
                    name="artist_code"
                    className="w-full"
                />
            </FormItem>
        )
    }

    return (
        <p>
            Go ahead and hit that submit button and tweet @zedsoftworks with the tags
            #JOINNEMU and #NEMUART and an art piece that you&apos;d like to show off (it
            doesn&apos;t have to be recent). Please note that we only have to verify that
            you&apos;re the artist that submited the request. ANY and ALL art is welcome
            on nemu!
        </p>
    )
}
