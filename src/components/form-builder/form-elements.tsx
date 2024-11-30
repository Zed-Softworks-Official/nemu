import { TextFieldFormElement } from './elements/text-field'

export type ElementType = 'TextField'

export type FormElement = {
    type: ElementType

    construct: (id: string) => FormElementInstance

    designer_button: {
        icon: React.ElementType
        label: string
    }

    designer_component: React.FC<{ element_instance: FormElementInstance }>
    form_component: React.FC
    properties_component: React.FC<{ element_instance: FormElementInstance }>
}

export type FormElementInstance = {
    id: string
    type: ElementType
    metadata?: Record<string, unknown>
}

type FormElementsType = Record<ElementType, FormElement>

export const FormElements: FormElementsType = {
    TextField: TextFieldFormElement
}
