'use client'

import { z } from 'zod'
import { useEffect } from 'react'
import { Heading2 } from 'lucide-react'
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
    FormElementInstance
} from '~/app/_components/form-builder/elements/form-elements'

const type: ElementType = 'SubtitleField'
const metadata = {
    title: 'Subtitle Field'
}

export const SubtitleFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: Heading2,
        label: 'Subtitle Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: () => true
}

type CustomInstance = FormElementInstance & {
    metadata: typeof metadata
}

function DesignerComponent(props: { element_instance: FormElementInstance }) {
    const element = props.element_instance as CustomInstance
    const { title } = element.metadata

    return (
        <div className="flex w-full flex-col gap-2">
            <Label className="text-muted-foreground">Subtitle Field</Label>
            <p className="text-lg">{title}</p>
        </div>
    )
}

function FormComponent(props: { element_instance: FormElementInstance }) {
    const element = props.element_instance as CustomInstance
    const { title } = element.metadata

    return <p className="text-lg">{title}</p>
}

const properties_schema = z.object({
    title: z.string().min(2).max(50)
})

type PropertiesFormSchemaType = z.infer<typeof properties_schema>

function PropertiesComponent(props: { element_instance: FormElementInstance }) {
    const { update_element } = useDesigner()

    const element = props.element_instance as CustomInstance
    const { title } = element.metadata

    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(properties_schema),
        mode: 'onBlur',
        defaultValues: {
            title: title ?? ''
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
                    name="title"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Title</FormLabel>
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
                                Add a title to organize and structure your form. <br />
                                Use this to create clear sections and headings
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}
