import { TextFieldFormElement } from './text-field'

export type ElementsType = 'TextField'

export type FormElement = {
    type: ElementsType

    construct: (id: string) => FormElementInstance

    designer_btn_element: {
        icon: React.ElementType
        label: string
    }

    designer_component: React.FC
    form_component: React.FC
    properties_component: React.FC
}

type FormElementsType = {
    [key in ElementsType]: FormElement
}

export type FormElementInstance = {
    id: string
    type: ElementsType
    extra_attributes?: Record<string, any>
}

export const FormElements: FormElementsType = {
    TextField: TextFieldFormElement
}
