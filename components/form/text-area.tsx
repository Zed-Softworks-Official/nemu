import { ClassNames } from '@/core/helpers'
import { TextareaHTMLAttributes, forwardRef } from 'react'

interface InputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label: string
    error?: boolean
    labelDisabled?: boolean
    additionalClasses?: string
}

const TextAreaInput = forwardRef<HTMLTextAreaElement, InputProps>(
    ({ label, labelDisabled, additionalClasses, error, ...props }, ref) => {
        return (
            <div className="mb-5">
                {!labelDisabled && (
                    <label htmlFor={props.name} className="block mb-5">
                        {label}:
                    </label>
                )}

                <textarea
                    ref={ref}
                    {...props}
                    className={ClassNames(
                        error && 'input-error',
                        'textarea resize-none w-full',
                        additionalClasses && additionalClasses
                    )}
                ></textarea>
            </div>
        )
    }
)

export default TextAreaInput
