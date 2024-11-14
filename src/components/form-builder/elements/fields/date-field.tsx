// 'use client'

// import {
//     ElementsType,
//     FormElement,
//     FormElementInstance,
//     SubmitFunction
// } from '~/components/form-builder/elements/form-elements'

// import { useForm } from 'react-hook-form'
// import { zodResolver } from '@hookform/resolvers/zod'

// import * as z from 'zod'
// import { Fragment, useEffect, useState } from 'react'
// import { useDesigner } from '~/components/form-builder/designer/designer-context'
// import { DesignerCheckboxField, DesignerInputField } from '~/components/form-builder/elements/input-field'
// // import { Popover, Transition } from '@headlessui/react'
// // import { format } from 'date-fns'
// import { CalendarIcon } from 'lucide-react'

// const type: ElementsType = 'DateField'

// const extra_attributes = {
//     label: 'Date Field',
//     helperText: 'Pick a date',
//     required: false
// }

// const propertiesSchema = z.object({
//     label: z.string().min(2).max(50),
//     helperText: z.string().max(200),
//     required: z.boolean().default(false)
// })

// export const DateFieldFormElement: FormElement = {
//     type,

//     construct: (id: string) => ({
//         id,
//         type,
//         extra_attributes
//     }),

//     designer_btn_element: {
//         icon: CalendarIcon,
//         label: 'Date Field'
//     },

//     designer_component: DesignerComponent,
//     form_component: FormComponent,
//     properties_component: PropertiesComponent,

//     validate: (formElement: FormElementInstance, currentValue: string): boolean => {
//         const element = formElement as CustomInstance
//         if (element.extra_attributes.required) {
//             return currentValue.length > 0
//         }

//         return true
//     }
// }

// type CustomInstance = FormElementInstance & {
//     extra_attributes: typeof extra_attributes
// }

// type PropertiesFormSchemaType = z.infer<typeof propertiesSchema>

// function DesignerComponent({
//     elementInstance
// }: {
//     elementInstance: FormElementInstance
// }) {
//     const element = elementInstance as CustomInstance
//     const { label, required, placeholder, helperText } = element.extra_attributes

//     return (
//         <div className="card bg-base-100 shadow-xl w-full">
//             <div className="card-body">
//                 <label className="text-sm text-base-content/80">Text Field</label>
//                 <h2 className="card-title">
//                     {label}
//                     {required && '*'}
//                 </h2>
//                 <button type="button" className="btn btn-outline">
//                     <CalendarIcon className="w-6 h-6" />
//                     Pick a date
//                 </button>
//                 {helperText && <p className="text-base-content/80">{helperText}</p>}
//             </div>
//         </div>
//     )
// }

// function FormComponent({
//     elementInstance,
//     submitValue,
//     isInvalid,
//     defaultValue
// }: {
//     elementInstance: FormElementInstance
//     submitValue?: SubmitFunction
//     isInvalid?: boolean
//     defaultValue?: string
// }) {
//     const element = elementInstance as CustomInstance
//     const { label, required, helperText } = element.extra_attributes

//     const [date, setDate] = useState<Date | undefined>(
//         defaultValue ? new Date(defaultValue) : undefined
//     )
//     const [error, setError] = useState(false)

//     useEffect(() => {
//         setError(isInvalid === true)
//     }, [isInvalid])

//     return (
//         <div className="card bg-base-300 w-full">
//             <div className="card-body">
//                 <h2 className={ClassNames(error && 'text-error', 'card-title')}>
//                     {label}
//                     {required && '*'}
//                 </h2>
//                 <Popover>
//                     <Popover.Button className={'btn btn-outline w-full'}>
//                         <CalendarIcon className="w-6 h-6" />
//                         {date ? format(date, 'PPP') : 'Pick a date'}
//                     </Popover.Button>
//                     <Transition
//                         as={Fragment}
//                         enter="transition ease-out duration-200"
//                         enterFrom="opacity-0 translate-y-1"
//                         enterTo="opacity-100 translate-y-0"
//                         leave="transition ease-in duration-150"
//                         leaveFrom="opacity-100 translate-y-0"
//                         leaveTo="opacity-0 translate-y-1"
//                     >
//                         <Popover.Panel className={'absolute z-10'}>
//                             <div className="card bg-base-200">
//                                 <div className="card-body">
//                                     <h1>Date Picker</h1>
//                                 </div>
//                             </div>
//                         </Popover.Panel>
//                     </Transition>
//                 </Popover>
//                 {helperText && (
//                     <p
//                         className={ClassNames(
//                             error ? 'text-error/80' : 'text-base-content/80'
//                         )}
//                     >
//                         {helperText}
//                     </p>
//                 )}
//             </div>
//         </div>
//     )
// }

// function PropertiesComponent({
//     elementInstance
// }: {
//     elementInstance: FormElementInstance
// }) {
//     const element = elementInstance as CustomInstance
//     const { updateElement } = useDesigner() as DesignerContextType
//     const form = useForm<PropertiesFormSchemaType>({
//         resolver: zodResolver(propertiesSchema),
//         mode: 'onBlur',
//         defaultValues: {
//             label: element.extra_attributes.label,
//             helperText: element.extra_attributes.helperText,
//             required: element.extra_attributes.required
//         }
//     })

//     useEffect(() => {
//         form.reset(element.extra_attributes)
//     }, [element, form])

//     function applyChanges(values: PropertiesFormSchemaType) {
//         updateElement(element.id, {
//             ...element,
//             extra_attributes: {
//                 ...values
//             }
//         })
//     }

//     return (
//         <form
//             onBlur={form.handleSubmit(applyChanges)}
//             onSubmit={(e) => {
//                 e.preventDefault()
//             }}
//             className="flex flex-col w-full space-y-3"
//         >
//             <DesignerInputField
//                 label="Label"
//                 description={
//                     <p className="text-base-content/80">
//                         The label of the field. <br /> This will be displayed about the
//                         field.
//                     </p>
//                 }
//                 {...form.register('label')}
//             />
//             <DesignerInputField
//                 label="Helper Text"
//                 description={
//                     <p className="text-base-content/80">
//                         Add a bit more detail to the field. <br />
//                         This will be displayed below the field.
//                     </p>
//                 }
//                 {...form.register('helperText')}
//             />
//             <DesignerCheckboxField
//                 label="Required"
//                 type="checkbox"
//                 description={
//                     <p className="text-base-content/80">
//                         This will determine whether this is a required field.
//                     </p>
//                 }
//                 {...form.register('required')}
//             />
//         </form>
//     )
// }
