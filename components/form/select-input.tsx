import { ClassNames } from '@/core/helpers'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { SelectHTMLAttributes, forwardRef } from 'react'

export interface SelectFieldOptions {
    key: string
    value: any
}

interface InputProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label: string
    options?: SelectFieldOptions[]
    plainOptions?: string[]
    error?: boolean
    labelDisabled?: boolean
    join?: boolean
}

const SelectField = forwardRef<HTMLSelectElement, InputProps>(
    ({ label, error, labelDisabled, options, plainOptions, join, ...props }, ref) => {
        return (
            <div className="form-control">
                {!labelDisabled && (
                    <label htmlFor={props.name} className="label">
                        {label}:
                    </label>
                )}
                <div className={ClassNames(join && 'join w-full')}>
                    <select
                        ref={ref}
                        className={ClassNames(
                            'select w-full',
                            error && 'select-error',
                            join && 'join-item'
                        )}
                        {...props}
                    >
                        <option disabled selected>
                            {props.placeholder}
                        </option>
                        {plainOptions ? (
                            <>
                                {plainOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </>
                        ) : (
                            <>
                                {options!.map((option) => (
                                    <option key={option.key} value={option.value}>
                                        {option.key}
                                    </option>
                                ))}
                            </>
                        )}
                    </select>
                    {join && (
                        <button
                            type="button"
                            className="btn btn-ghost bg-base-200 join-item"
                        >
                            <PlusCircleIcon className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>
        )
    }
)

export default SelectField
