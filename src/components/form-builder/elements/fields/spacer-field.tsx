'use client'

import { z } from 'zod'
import { useEffect } from 'react'
import { SeparatorHorizontal } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Label } from '~/components/ui/label'
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
    FormElementInstance
} from '~/components/form-builder/elements/form-elements'
import { Slider } from '~/components/ui/slider'

const type: ElementType = 'SpacerField'
const metadata = {
    height: 20 // px
}

export const SpacerFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: SeparatorHorizontal,
        label: 'Spacer Field'
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
    const { height } = element.metadata

    return (
        <div className="flex w-full flex-col gap-2">
            <Label className="text-muted-foreground">Spacer Field: {height}px</Label>
        </div>
    )
}

function FormComponent(props: { element_instance: FormElementInstance }) {
    const element = props.element_instance as CustomInstance
    const { height } = element.metadata

    return <div style={{ height, width: '100%' }}></div>
}

const properties_schema = z.object({
    height: z.number().min(5).max(200)
})

type PropertiesFormSchemaType = z.infer<typeof properties_schema>

function PropertiesComponent(props: { element_instance: FormElementInstance }) {
    const { update_element } = useDesigner()

    const element = props.element_instance as CustomInstance
    const { height } = element.metadata

    const form = useForm<PropertiesFormSchemaType>({
        resolver: zodResolver(properties_schema),
        mode: 'onBlur',
        defaultValues: {
            height: height ?? 20
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
                    name="height"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Height (px): {form.watch('height')}</FormLabel>
                            <FormControl className="pt-2">
                                <Slider
                                    defaultValue={[field.value]}
                                    min={5}
                                    max={200}
                                    step={1}
                                    onValueChange={(value) => field.onChange(value[0])}
                                />
                            </FormControl>
                            <FormDescription>
                                Add a height to create a spacer between elements.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    )
}
