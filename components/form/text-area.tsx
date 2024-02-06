import { ClassNames } from '@/core/helpers'
import { TextareaHTMLAttributes, forwardRef } from 'react'

interface InputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label: string
    error?: boolean
    labelDisabled?: boolean
}

const TextAreaInput = forwardRef<HTMLTextAreaElement, InputProps>(
    ({ label, error, ...props }, ref) => {
        return (
            <div className="mb-5">
                <label htmlFor={props.name} className="block mb-5">
                    {label}:
                </label>
                <textarea
                    ref={ref}
                    {...props}
                    className={ClassNames(
                        error && 'input-error',
                        'textarea resize-none w-full'
                    )}
                ></textarea>
            </div>
        )
    }
)

export default TextAreaInput