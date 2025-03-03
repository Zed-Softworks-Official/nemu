'use client'

import { z } from 'zod'
import { useEffect, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'

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
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Button } from '~/components/ui/button'
import { Calendar } from '~/components/ui/calendar'

const type: ElementType = 'DateField'
const metadata = {
    label: 'Date Field',
    helper_text: 'Pick a date',
    required: false
}

export const DateFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: CalendarIcon,
        label: 'Date Field'
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
    const { label, required, helper_text } = element.metadata

    return (
        <div className="flex w-full flex-col gap-2">
            <Label>
                {label}
                {required && '*'}
            </Label>
            <Button
                disabled
                variant={'outline'}
                className="text-muted-foreground w-full justify-start text-left font-normal"
            >
                <CalendarIcon className="mr-2 h-4 w-4" />
                Pick a Date
            </Button>
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
    const { label, required, helper_text } = element.metadata

    const [date, setDate] = useState<Date | undefined>(
        props.default_value ? new Date(props.default_value) : undefined
    )

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
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={'outline'}
                        className={cn(
                            'border-background-tertiary bg-background-secondary w-[280px] justify-start text-left font-normal',
                            !date && 'text-muted-foreground',
                            error && 'border-destructive'
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, 'PPP') : <span>Pick a date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(date) => {
                            setDate(date)

                            if (!props.submit_value) return
                            const value = date?.toUTCString() ?? ''
                            const valid = DateFieldFormElement.validate(element, value)
                            setError(!valid)
                            if (!valid) return

                            props.submit_value(element.id, value)
                        }}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
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
