import { TextFieldFormElement } from './text-field'

export type ElementsType = 'TextField'
export type SubmitFunction = (key: string, value: string) => void

export type FormElement = {
    type: ElementsType

    construct: (id: string) => FormElementInstance

    designer_btn_element: {
        icon: React.ElementType
        label: string
    }

    designer_component: React.FC<{
        elementInstance: FormElementInstance
    }>

    form_component: React.FC<{
        elementInstance: FormElementInstance
        submitValue?: SubmitFunction,
        isInvalid?: boolean,
        defaultValue?: string
    }>

    properties_component: React.FC<{
        elementInstance: FormElementInstance
    }>

    validate: (formElement: FormElementInstance, currentValue: string) => boolean
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
