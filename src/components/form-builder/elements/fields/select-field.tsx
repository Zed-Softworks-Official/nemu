'use client'

import { z } from 'zod'
import { useEffect, useState } from 'react'
import { List, Plus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from '~/components/ui/form'

import { useDesigner } from '~/components/form-builder/designer/designer-context'
import type {
    ElementType,
    FormElement,
    FormElementInstance,
    SubmitValueFunction
} from '~/components/form-builder/elements/form-elements'
import { Switch } from '~/components/ui/switch'
import { cn } from '~/lib/utils'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { Button } from '~/components/ui/button'

const type: ElementType = 'SelectField'
const metadata = {
    label: 'Select Field',
    helper_text: 'This is a select field',
    placeholder: 'Select an option',
    required: false,
    options: []
}

export const SelectFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: List,
        label: 'Select Field'
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
            <Select>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
            </Select>
            {helper_text && (
                <p className="text-sm text-muted-foreground">{helper_text}</p>
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
    const { label, required, placeholder, helper_text, options } = element.metadata

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
            <Select
                defaultValue={value}
                onValueChange={(val) => {
                    setValue(val)

                    if (!props.submit_value) return
                    const valid = SelectFieldFormElement.validate(element, val)
                    setError(!valid)
                    if (!valid) return

                    props.submit_value(element.id, val)
                }}
            >
                <SelectTrigger
                    className={cn(
                        'w-full bg-background-secondary',
                        error && 'border-destructive'
                    )}
                >
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option} value={option}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {helper_text && (
                <p
                    className={cn(
                        'text-sm text-muted-foreground',
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
    options: z.array(z.string()).default([])
})

type PropertiesFormSchemaType = z.infer<typeof properties_schema>

function PropertiesComponent(props: { element_instance: FormElementInstance }) {
    const { update_element } = useDesigner()

    const element = props.element_instance as CustomInstance
    const { label, required, placeholder, helper_text, options } = element.metadata

    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(properties_schema),
        mode: 'onBlur',
        defaultValues: {
            label,
            required,
            placeholder,
            helper_text,
            options
        }
    })

    useEffect(() => {
        form.reset(element.metadata)
    }, [element, form])

    function process_form(values: PropertiesFormSchemaType) {
        update_element(element.id, {
            ...element,
            metadata: values
        })
    }

    return (
        <Form {...form}>
            <form
                onBlur={form.handleSubmit(process_form)}
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
                <Separator />
                <FormField
                    control={form.control}
                    name="options"
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center justify-between">
                                <FormLabel>Options</FormLabel>
                                <Button
                                    variant="outline"
                                    className="gap-2"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        form.setValue(
                                            'options',
                                            field.value.concat('New Option')
                                        )
                                    }}
                                >
                                    <Plus />
                                    Add
                                </Button>
                            </div>
                            <div className="flex flex-col gap-2">
                                {form.watch('options').map((option, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between gap-1"
                                    >
                                        <Input
                                            className="bg-background"
                                            placeholder=""
                                            value={option}
                                            onChange={(e) => {
                                                field.value[index] = e.currentTarget.value
                                                field.onChange(field.value)
                                            }}
                                        />
                                        <Button
                                            variant={'ghost'}
                                            size={'icon'}
                                            onClick={(e) => {
                                                e.preventDefault()
                                                const newOptions = field.value.filter(
                                                    (_, i) => i !== index
                                                )

                                                form.setValue('options', newOptions)
                                            }}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                ))}
                            </div>
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
