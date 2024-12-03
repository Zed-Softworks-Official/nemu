import { TextFieldFormElement } from './fields/text-field'
import { TitleFieldFormElement } from './fields/title-field'
import { SubtitleFieldFormElement } from './fields/subtitle-field'
import { ParagraphFieldFormElement } from './fields/paragraph-field'
import { SeparatorFieldFormElement } from './fields/separator-field'
import { SpacerFieldFormElement } from './fields/spacer-field'
import { NumberFieldFormElement } from './fields/number-field'
import { TextareaFieldFormElement } from './fields/textarea-field'
import { DateFieldFormElement } from './fields/date-field'
import { SelectFieldFormElement } from './fields/select-field'
import { CheckboxFieldFormElement } from './fields/checkbox-field'

export type ElementType =
    | 'TextField'
    | 'TitleField'
    | 'SubtitleField'
    | 'ParagraphField'
    | 'SeparatorField'
    | 'SpacerField'
    | 'NumberField'
    | 'TextareaField'
    | 'DateField'
    | 'SelectField'
    | 'CheckboxField'

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
    TextField: TextFieldFormElement,
    TitleField: TitleFieldFormElement,
    SubtitleField: SubtitleFieldFormElement,
    ParagraphField: ParagraphFieldFormElement,
    SeparatorField: SeparatorFieldFormElement,
    SpacerField: SpacerFieldFormElement,
    NumberField: NumberFieldFormElement,
    TextareaField: TextareaFieldFormElement,
    DateField: DateFieldFormElement,
    SelectField: SelectFieldFormElement,
    CheckboxField: CheckboxFieldFormElement
}
