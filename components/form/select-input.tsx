import ClassNames from '@/core/helpers'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { SelectHTMLAttributes, forwardRef } from 'react'

interface InputProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label: string
    options: string[]
    error?: boolean
    labelDisabled?: boolean
    join?: boolean
}

const SelectField = forwardRef<HTMLSelectElement, InputProps>(
    ({ label, error, labelDisabled, options, join, ...props }, ref) => {
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
                        {options.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                    {join && (
                        <button type="button" className="btn btn-ghost join-item">
                            <PlusCircleIcon className="w-6 h-6" />
                        </button>
                    )}
                </div>
            </div>
        )
    }
)

export default SelectField
