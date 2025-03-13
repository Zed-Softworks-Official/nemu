'use client'

import { z } from 'zod'
import { useEffect, useState } from 'react'
import { Vote } from 'lucide-react'
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
import { Checkbox } from '~/app/_components/ui/checkbox'

const type: ElementType = 'CheckboxField'
const metadata = {
    label: 'Checkbox Field',
    helper_text: 'This is a checkbox field',
    required: false
}

export const CheckboxFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: Vote,
        label: 'Checkbox Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: (form_element: FormElementInstance, current_value: string) => {
        const element = form_element as CustomInstance

        if (element.metadata.required) {
            return current_value === 'true'
        }

        return true
    }
}

type CustomInstance = FormElementInstance & {
    metadata: typeof metadata
}

function DesignerComponent(props: { element_instance: FormElementInstance }) {
    const element = props.element_instance as CustomInstance
    const { label, required, helper_text } = element.metadata
    const id = `checkbox-${element.id}`

    return (
        <div className="items-top flex space-x-2">
            <Checkbox id={id} />
            <div className="grid gap-1.5 leading-none">
                <Label htmlFor={id}>
                    {label}
                    {required && '*'}
                </Label>
                {helper_text && (
                    <p className="text-muted-foreground text-sm">{helper_text}</p>
                )}
            </div>
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
    const { label, required, helper_text } = element.metadata

    const [value, setValue] = useState<boolean>(
        props.default_value === 'true' ? true : false
    )
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(props.is_invalid === true)
    }, [props.is_invalid])

    const id = `checkbox-${element.id}`

    return (
        <div className="items-top flex space-x-2">
            <Checkbox
                id={id}
                checked={value}
                className={cn(error && 'border-destructive')}
                onCheckedChange={(checked) => {
                    let value = false
                    if (checked === true) value = true

                    setValue(value)
                    if (!props.submit_value) return
                    const valid = CheckboxFieldFormElement.validate(
                        element,
                        value ? 'true' : 'false'
                    )
                    setError(!valid)
                    props.submit_value(element.id, valid ? 'true' : 'false')
                }}
            />
            <div className="grid gap-1.5 leading-none">
                <Label htmlFor={id} className={cn(error && 'text-destructive')}>
                    {label}
                    {required && '*'}
                </Label>
                {helper_text && (
                    <p className="text-muted-foreground text-sm">{helper_text}</p>
                )}
            </div>
        </div>
    )
}

const properties_schema = z.object({
    label: z.string().min(2).max(50),
    helper_text: z.string().min(2).max(50),
    required: z.boolean().default(false)
})

type PropertiesFormSchemaType = z.infer<typeof properties_schema>

function PropertiesComponent(props: { element_instance: FormElementInstance }) {
    const { update_element } = useDesigner()

    const element = props.element_instance as CustomInstance
    const { label, required, helper_text } = element.metadata

    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(properties_schema),
        mode: 'onBlur',
        defaultValues: {
            label,
            required,
            helper_text
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
