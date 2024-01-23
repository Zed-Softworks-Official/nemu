import ClassNames from '@/core/helpers'
import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

export default function TextAreaInput({
    label,
    labelDisabled,
    error,
    addClasses,
    ...props
}: {
    label: string
    error?: boolean
    labelDisabled?: boolean,
    addClasses?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <div className="mb-5">
            {!labelDisabled && (
                <label htmlFor={props.name} className="block mb-5">
                    {label}:
                </label>
            )}
            <textarea
                {...props}
                className={ClassNames(error && 'input-error', 'textarea resize-none w-full', addClasses && addClasses)}
            ></textarea>
        </div>
    )
}
