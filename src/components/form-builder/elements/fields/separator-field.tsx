'use client'

import { Minus } from 'lucide-react'

import { Label } from '~/components/ui/label'

import type {
    ElementType,
    FormElement
} from '~/components/form-builder/elements/form-elements'
import { Separator } from '~/components/ui/separator'

const type: ElementType = 'SeparatorField'
const metadata = {}

export const SeparatorFieldFormElement: FormElement = {
    type: type,

    construct: (id: string) => ({
        id,
        type,
        metadata
    }),
    designer_button: {
        icon: Minus,
        label: 'Separator Field'
    },

    designer_component: DesignerComponent,
    form_component: FormComponent,
    properties_component: PropertiesComponent,

    validate: () => true
}

function DesignerComponent() {
    return (
        <div className="flex w-full flex-col gap-2">
            <Label className="text-muted-foreground">Separator Field</Label>
            <Separator />
        </div>
    )
}

function FormComponent() {
    return <Separator />
}

function PropertiesComponent() {
    return <p>No properties for this element.</p>
}
