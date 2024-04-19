import { TextFieldFormElement } from './fields/text-field'
import { TitleFieldFormElement } from './fields/title-field'
import { SubTitleFieldFormElement } from './fields/subtitle-field'
import { ParagraphFieldFormElement } from './fields/paragraph-field'
import { DividerFieldFormElement } from './fields/divider-field'
import { SpacerFieldFormElement } from './fields/spacer-field'
import { NumberFieldFormElement } from './fields/number-field'
import { TextAreaFieldFormElement } from './fields/text-area-field'
import { DateFieldFormElement } from './fields/date-field'
import { SelectFieldFormElement } from './fields/select-field'
import { CheckboxFieldFormElement } from './fields/checkbox-field'

export type ElementsType =
    | 'TextField'
    | 'TitleField'
    | 'SubTitleField'
    | 'ParagraphField'
    | 'DividerField'
    | 'SpacerField'
    | 'NumberField'
    | 'TextAreaField'
    // | 'DateField'
    | 'SelectField'
    | 'CheckboxField'

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
        submitValue?: SubmitFunction
        isInvalid?: boolean
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
    TextField: TextFieldFormElement,
    TitleField: TitleFieldFormElement,
    SubTitleField: SubTitleFieldFormElement,
    ParagraphField: ParagraphFieldFormElement,
    DividerField: DividerFieldFormElement,
    SpacerField: SpacerFieldFormElement,
    NumberField: NumberFieldFormElement,
    TextAreaField: TextAreaFieldFormElement,
    // DateField: DateFieldFormElement,
    SelectField: SelectFieldFormElement,
    CheckboxField: CheckboxFieldFormElement
}
