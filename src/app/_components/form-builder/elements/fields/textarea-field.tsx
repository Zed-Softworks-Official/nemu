'use client'

import { z } from 'zod'
import { useEffect, useState } from 'react'
import { Scaling } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Label } from '~/app/_components/ui/label'
import { Input } from '~/app/_components/ui/input'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/app/_components/ui/form'

import { useDesigner } from '~/app/_components/form-builder/designer/designer-context'
import type {
    ElementType,
    FormElement,
    FormElementInstance,
    SubmitValueFunction
} from '~/app/_components/form-builder/elements/form-elements'
import { Switch } from '~/app/_components/ui/switch'
import { cn } from '~/lib/utils'
import { Textarea } from '~/app/_components/ui/textarea'
import { Slider } from '~/app/_components/ui/slider'

const type: ElementType = 'TextareaField'
const metadata = {
    label: 'Textarea Field',
    helper_text: 'This is a textarea field',
    placeholder: 'Enter text here',
    required: false,
    rows: 6
}

export const TextareaFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: Scaling,
        label: 'Textarea Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: (form_element: FormElementInstance, current_value: string) => {
        const element = form_element as CustomInstance

        if (element.metadata.required) {
            return current_value.length > 0
        }

        return true
    }
}

type CustomInstance = FormElementInstance & {
    metadata: typeof metadata
}

function DesignerComponent(props: { element_instance: FormElementInstance }) {
    const element = props.element_instance as CustomInstance
    const { label, required, placeholder, helper_text } = element.metadata

    return (
        <div className="flex w-full flex-col gap-2">
            <Label>
                {label}
                {required && '*'}
            </Label>
            <Textarea
                readOnly
                disabled
                placeholder={placeholder}
                className="bg-background-secondary"
            ></Textarea>
            {helper_text && (
                <p className="text-muted-foreground text-sm">{helper_text}</p>
            )}
        </div>
    )
}

function FormComponent(props: {
    element_instance: FormElementInstance
    submit_value?: SubmitValueFunction
    is_invalid?: boolean
    default_value?: string
}) {
    const element = props.element_instance as CustomInstance
    const { label, required, placeholder, helper_text, rows } = element.metadata

    const [value, setValue] = useState(props.default_value ?? '')
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(props.is_invalid === true)
    }, [props.is_invalid])

    return (
        <div className="flex w-full flex-col gap-2">
            <Label className={cn(error && 'text-destructive')}>
                {label}
                {required && '*'}
            </Label>
            <Textarea
                placeholder={placeholder}
                className={cn('bg-background-secondary', error && 'border-destructive')}
                value={value}
                onChange={(e) => setValue(e.currentTarget.value)}
                onBlur={() => {
                    if (!props.submit_value) return

                    const valid = TextareaFieldFormElement.validate(element, value)
                    setError(!valid)
                    if (!valid) return

                    props.submit_value(element.id, value)
                }}
                rows={rows}
            ></Textarea>
            {helper_text && (
                <p
                    className={cn(
                        'text-muted-foreground text-sm',
                        error && 'text-destructive'
                    )}
                >
                    {helper_text}
                </p>
            )}
        </div>
    )
}

const properties_schema = z.object({
    label: z.string().min(2).max(50),
    helper_text: z.string().min(2).max(50),
    placeholder: z.string().min(2).max(50),
    required: z.boolean().default(false),
    rows: z.number().min(1).max(10)
})

type PropertiesFormSchemaType = z.infer<typeof properties_schema>

function PropertiesComponent(props: { element_instance: FormElementInstance }) {
    const { update_element } = useDesigner()

    const element = props.element_instance as CustomInstance
    const { label, required, placeholder, helper_text, rows } = element.metadata

    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(properties_schema),
        mode: 'onBlur',
        defaultValues: {
            label,
            required,
            placeholder,
            helper_text,
            rows
        }
    })

    useEffect(() => {
        form.reset(element.metadata)
    }, [element, form])

    function processForm(values: PropertiesFormSchemaType) {
        update_element(element.id, {
            ...element,
            metadata: values
        })
    }

    return (
        <Form {...form}>
            <form
                onBlur={form.handleSubmit(processForm)}
                className="space-y-3"
                onSubmit={(e) => e.preventDefault()}
            >
                <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Label</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    className="bg-background"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormDescription>
                                The label of the field. <br /> It will be displayed above
                                the field.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="helper_text"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Helper Text</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    className="bg-background"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormDescription>
                                Helper text for the field. <br /> It will be displayed
                                below the field.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="rows"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Rows: {form.watch('rows')}</FormLabel>
                            <FormControl>
                                <Slider
                                    defaultValue={[field.value]}
                                    min={1}
                                    max={10}
                                    step={1}
                                    onValueChange={(value) => field.onChange(value[0])}
                                />
                            </FormControl>
                            <FormDescription>
                                The number of rows in the textarea.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="placeholder"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Placeholder</FormLabel>
                            <FormControl>
                                <Input
                                    {...field}
                                    className="bg-background"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                        }
                                    }}
                                />
                            </FormControl>
                            <FormDescription>
                                The placeholder text. <br /> It will be displayed inside
                                the field when empty.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="required"
                    render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-xs">
                            <div className="space-y-0.5">
                                <FormLabel>Required</FormLabel>
                                <FormDescription>
                                    Whether the field is required or not.
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}
