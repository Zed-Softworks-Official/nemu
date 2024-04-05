import { ClassNames } from '@/core/helpers'
import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    additionalClassnames?: string
    containerClassnames?: string
    error?: boolean
    errorMessage?: string
    labelDisabled?: boolean
}

const TextField = forwardRef<HTMLInputElement, InputProps>(
    (
        {
            label,
            error,
            errorMessage,
            labelDisabled,
            containerClassnames,
            additionalClassnames,
            ...props
        },
        ref
    ) => {
        return (
            <div className={cn('form-control', containerClassnames)}>
                {!labelDisabled && <label className="label">{label}:</label>}
                <input
                    ref={ref}
                    {...props}
                    className={ClassNames(
                        error && 'input-error',
                        'input w-full',
                        additionalClassnames && additionalClassnames
                    )}
                />
                {errorMessage && (
                    <label className="label text-error">{errorMessage}</label>
                )}
            </div>
        )
    }
)

export default TextField
