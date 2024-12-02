import { TextFieldFormElement } from './fields/text-field'

export type ElementType = 'TextField'
export type SubmitValueFunction = (key: string, value: string) => void

export type FormElement = {
    type: ElementType

    construct: (id: string) => FormElementInstance

    designer_button: {
        icon: React.ElementType
        label: string
    }

    designer_component: React.FC<{ element_instance: FormElementInstance }>
    form_component: React.FC<{
        element_instance: FormElementInstance
        submit_value?: SubmitValueFunction
        is_invalid?: boolean
        default_value?: string
    }>
    properties_component: React.FC<{ element_instance: FormElementInstance }>

    validate: (form_element: FormElementInstance, current_value: string) => boolean
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
