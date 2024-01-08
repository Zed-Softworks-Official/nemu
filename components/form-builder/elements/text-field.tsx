'use client'

import { DocumentTextIcon } from '@heroicons/react/20/solid'
import { ElementsType, FormElement } from './form-elements'

const type: ElementsType = 'TextField'

export const TextFieldFormElement: FormElement = {
    type,

    construct: (id: string) => ({
        id,
        type,
        extra_attributes: {
            label: 'Text Field',
            helperText: 'Helper Text',
            required: false,
            placeholder: 'Value here...'
        }
    }),

    designer_btn_element: {
        icon: DocumentTextIcon,
        label: 'Text Field'
    },

    designer_component: () => <div>Designer Component</div>,
    form_component: () => <div>Form Component</div>,
    properties_component: () => <div>Properties Component</div>
}
