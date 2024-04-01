import { ClassNames } from '@/core/helpers'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    additionalClassnames?: string
    error?: boolean
    errorMessage?: string
    labelDisabled?: boolean
}

const TextField = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, errorMessage, labelDisabled, additionalClassnames, ...props }, ref) => {
        return (
            <>
                <div className="form-control">
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
                    {errorMessage && <label className='label text-error'>{errorMessage}</label>}
                </div>
            </>
        )
    }
)

export default TextField
