'use client'

import * as z from 'zod'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useFormContext } from '@/components/form/form-context'
import TextField from '@/components/form/text-input'

import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import SelectField, { SelectFieldOptions } from '@/components/form/select-input'
import Loading from '@/components/loading'
import CheckboxField from '@/components/form/checkbox-input'
import MarkdownEditor from '@/components/form/markdown-text-area'
import { useDashboardContext } from '@/components/navigation/dashboard/dashboard-context'
import FormDropzone from '@/components/form/form-dropzone'
import CurrencyField from '@/components/form/currency-field'
import {
    AWSFileModification,
    AWSLocations,
    CommissionAvailability
} from '@/core/structures'
import { toast } from 'react-toastify'
import { CommissionEditableResponse, NemuResponse, StatusCode } from '@/core/responses'
import ImageEditor from '@/components/form/image-editor/image-editor'
import NemuImage from '@/components/nemu-image'
import FormSubmitButtons from './submit-buttons'
import { useRouter } from 'next/navigation'
import { api } from '@/core/trpc/react'

const commissionSchema = z.object({
    title: z.string().min(2).max(50),
    description: z.string().min(10).max(500),
    form: z.string().min(1),

    price: z.number().min(0).default(0).optional(),

    featured_image: z
        .any(z.instanceof(File).refine((file: File) => file.size != 0))
        .optional(),
    additional_images: z.any().optional(),

    rush: z.boolean().default(false),
    rush_charge: z.number().default(0).optional(),
    rush_percentage: z.boolean().default(false),

    max_commissions_until_waitlist: z.number().default(0).optional(),
    max_commissions_until_closed: z.number().default(0).optional(),

    commission_availability: z.number()
})

type CommissionSchemaType = z.infer<typeof commissionSchema>

export default function CommissionCreateEditForm({
    data
}: {
    data?: CommissionEditableResponse
}) {
    const { artist } = useDashboardContext()!
    const { image, additionalImages } = useFormContext()
    const {
        data: artistFormsData,
        isLoading: artistFormsIsLoading,
        refetch: artistFormsRefetch
    } = api.form.get_forms.useQuery({ artist_id: artist?.id! })

    const create_mutation = api.commissions.set_commission.useMutation()
    const update_mutation = api.commissions.update_commission.useMutation()

    const { push } = useRouter()

    const form = useForm<CommissionSchemaType>({
        resolver: zodResolver(commissionSchema),
        mode: 'onSubmit',
        defaultValues: {
            title: data ? data.commission.title : '',
            description: data ? data.commission.description : '',

            price: data ? data.commission.price! : 0,
            rush: data ? data.commission.rushOrdersAllowed : false,
            rush_charge: data ? data.commission.rushCharge! : 0,

            max_commissions_until_waitlist: data
                ? data.commission.maxCommissionsUntilWaitlist!
                : 0,
            max_commissions_until_closed: data
                ? data.commission.maxCommissionsUntilClosed!
                : 0,

            form: data && data.commission.formId,
            commission_availability: data && data.commission.availability
        }
    })

    const [submitting, setSubmitting] = useState(false)
    const [images, setImages] = useState<AWSFileModification[] | undefined>(
        data?.images as AWSFileModification[] | undefined
    )

    function GetFileKeysAsArray(string_array: AWSFileModification[]) {
        const array = string_array.slice(1, string_array.length)
        let result: string[] = []

        for (let i = 0; i < array.length; i++) {
            result.push(array[i].file_key)
        }

        return result
    }

    /**
     * Submits the actual form by checking whether the data attribute is assigned. If the data attribute is assigned
     * then we wish to update the existing commission and if the data attribute isn't assigned then we want to create
     * a new commission
     *
     * @param {CommissionSchemaType} values - The values of the form
     */
    async function SubmitCommission(values: CommissionSchemaType) {
        setSubmitting(true)

        if (data) {
            UpdateCommission(values)
            return
        }

        CreateCommission(values)
    }

    /**
     *
     * @param values
     */
    async function UpdateCommission(values: CommissionSchemaType) {
        const toast_id = toast.loading('Updating comission', { theme: 'dark' })

        // Update Images if any
        if (additionalImages) {
            const awsData = new FormData()
            awsData.append('commission_id', data?.commission.id!)
            awsData.append('old_featured_key', data?.commission.featuredImage!)
            awsData.append(`additional_files`, JSON.stringify(additionalImages))

            for (const imageFile of additionalImages!) {
                awsData.append(`file-${imageFile.file_key}`, imageFile.updated_file!)
            }

            if (image) {
                awsData.append('featured_image', image!)
                awsData.append('featured_image_key', crypto.randomUUID())
            }

            // Make Request to AWS Rest API to handle multiple files
            await fetch(`/api/aws/${artist?.id}/commission/multiple/update`, {
                method: 'post',
                body: awsData
            })
        }

        // Update the data
        update_mutation
            .mutateAsync({
                commission_id: data?.commission.id!,
                commission_data: {
                    title: values.title,
                    description: values.description,
                    price: values.price,
                    availability: values.commission_availability,
                    max_commissions_until_waitlist: values.max_commissions_until_waitlist,
                    max_commissions_until_closed: values.max_commissions_until_closed,
                    rush_orders_allowed: values.rush,
                    rush_charge: values.rush_charge,
                    rush_percentage: values.rush_percentage
                }
            })
            .then((response) => {
                setSubmitting(false)

                if (!response.success) {
                    toast.update(toast_id, {
                        render: 'Unable to Update Commission',
                        type: 'error',
                        autoClose: 5000,
                        isLoading: false
                    })

                    return
                }

                toast.update(toast_id, {
                    render: 'Updated Commission',
                    type: 'success',
                    autoClose: 5000,
                    isLoading: false
                })

                push('/dashboard/commissions')
            })
    }

    /**
     *
     * @param values
     */
    async function CreateCommission(values: CommissionSchemaType) {
        const toast_id = toast.loading('Creating commission', { theme: 'dark' })

        const featured_image_key = crypto.randomUUID()

        // Create formdata for the aws files
        const awsData = new FormData()
        awsData.append('featured_image', image!)
        awsData.append('featured_image_key', featured_image_key)
        awsData.append(`additional_files`, JSON.stringify(additionalImages!))

        for (const imageFile of additionalImages!) {
            awsData.append(`file-${imageFile.file_key}`, imageFile.updated_file!)
        }

        // Make Request to AWS Rest API to handle multiple files
        await fetch(`/api/aws/${artist?.id}/commission/multiple`, {
            method: 'post',
            body: awsData
        })

        // create new commission object
        create_mutation
            .mutateAsync({
                artist_id: artist?.id!,
                commission_data: {
                    title: values.title!,
                    description: values.description!,
                    featured_image: featured_image_key,
                    additional_images: GetFileKeysAsArray(additionalImages!),
                    price: values.price!,
                    availability: values.commission_availability!,
                    form_id: values.form!,
                    max_commissions_until_waitlist:
                        values.max_commissions_until_waitlist!,
                    max_commissions_until_closed: values.max_commissions_until_closed!,
                    rush_orders_allowed: values.rush!,
                    rush_charge: values.rush_charge!,
                    rush_percentage: values.rush_percentage!
                }
            })
            .then((response) => {
                if (!response.success) {
                    toast.update(toast_id, {
                        render: 'Unable to Create Commission',
                        type: 'error',
                        autoClose: 5000,
                        isLoading: false
                    })

                    return
                }

                toast.update(toast_id, {
                    render: 'Commission Created',
                    type: 'success',
                    autoClose: 5000,
                    isLoading: false
                })

                push('/dashboard/commissions')
            })
    }

    if (artistFormsIsLoading) {
        return <Loading />
    }

    function getFormsNames() {
        const result: SelectFieldOptions[] = []
        artistFormsData?.forEach((form) => {
            if (form.commissionId) {
                return
            }

            result.push({
                key: form.name,
                value: form.id
            })
        })

        return result
    }

    return (
        <div className="max-w-xl mx-auto">
            <form
                onSubmit={form.handleSubmit(SubmitCommission)}
                className="flex flex-col gap-5"
            >
                {/* {form.formState.errors && (
                    <div className='alert alert-error'>
                        <XCircleIcon className='w-6 h-6' />
                        <span>Oh Nyo! Something Went Wrong!</span>
                    </div>
                )} */}
                <TextField
                    label="Title"
                    placeholder="Title"
                    {...form.register('title')}
                />
                <Controller
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <MarkdownEditor
                            label="Description"
                            markdown={field.value}
                            placeholder="Enter a description of the commission"
                            input_name={field.name}
                            change_event={field.onChange}
                        />
                    )}
                />

                <div
                    className="tooltip"
                    data-tip="This will be the starting price, you'll be able to adjust it later based off of the commissioners requests"
                >
                    <CurrencyField
                        min={0}
                        label="Price"
                        placeholder="Price"
                        {...form.register('price', { valueAsNumber: true })}
                    />
                </div>
                <div className="divider"></div>

                <SelectField
                    label="Form"
                    options={getFormsNames()}
                    disabled={data != undefined}
                    placeholder="Select a form to use"
                    join
                    {...form.register('form')}
                />
                <SelectField
                    label="Commission Availabilty"
                    options={[
                        {
                            key: 'Open',
                            value: CommissionAvailability.Open
                        },
                        {
                            key: 'Waitlist',
                            value: CommissionAvailability.Waitlist
                        },
                        {
                            key: 'Closed',
                            value: CommissionAvailability.Closed
                        }
                    ]}
                    placeholder="Select an availability"
                    {...form.register('commission_availability', { valueAsNumber: true })}
                />
                <TextField
                    label="Commission Until Waitlist"
                    placeholder="0"
                    inputMode="numeric"
                    {...form.register('max_commissions_until_waitlist', {
                        valueAsNumber: true
                    })}
                />
                <TextField
                    label="Commission Until Closed"
                    placeholder="0"
                    inputMode="numeric"
                    {...form.register('max_commissions_until_closed', {
                        valueAsNumber: true
                    })}
                />
                <div className="divider"></div>

                <FormDropzone
                    label="Featured Image"
                    {...form.register('featured_image')}
                />
                {data && (
                    <div className="card shadow-xl bg-base-100">
                        <div className="card-body">
                            <h2 className="card-title">Current Featured Image</h2>
                            <div className="divider"></div>
                            <NemuImage
                                src={data?.images![0].signed_url!}
                                alt="Featured Image"
                                className="w-full h-full"
                                width={400}
                                height={400}
                            />
                        </div>
                    </div>
                )}
                <ImageEditor
                    label="Additional Images"
                    location={AWSLocations.Commission}
                    {...form.register('additional_images')}
                    images={data && (data.images as AWSFileModification[])}
                    edit_mode={data ? true : false}
                />

                <div className="divider"></div>
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <CheckboxField
                            label="Allow Rush Orders"
                            {...form.register('rush')}
                        />
                        <CheckboxField
                            label="Use Percentage"
                            {...form.register('rush_percentage')}
                        />
                        {form.watch('rush') && (
                            <CurrencyField
                                label="Rush Charge"
                                additionalClassnames="bg-base-300"
                                placeholder="Rush Charge"
                                percentage={form.watch('rush_percentage')}
                                {...form.register('rush_charge', { valueAsNumber: true })}
                            />
                        )}
                    </div>
                </div>

                <div className="divider"></div>
                <p className="text-base-content/80">
                    <i>
                        Note: Commissions will need to be published. Make sure you have
                        created the commission form for users to fill out upon a request.
                    </i>
                </p>
                <FormSubmitButtons
                    cancel_url="/dashboard/commissions"
                    disabled={submitting}
                    button_icon={
                        submitting ? (
                            <span className="loading loading-spinner"></span>
                        ) : (
                            <CheckCircleIcon className="w-6 h-6" />
                        )
                    }
                    submit_text={
                        submitting ? (
                            <>{data ? 'Updating Commission' : 'Creating Commission'}</>
                        ) : (
                            <>{data ? 'Update Commission' : 'Create Commission'}</>
                        )
                    }
                />
            </form>
        </div>
    )
}
