import classNames from '@/core/helpers'
import { SelectHTMLAttributes } from 'react'

export default function SelectInput({
    label,
    labelDisabled,
    error,
    options,
    ...props
}: {
    label: string
    error?: boolean
    labelDisabled?: boolean
    options: string[]
} & SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <div className="mb-5">
            {!labelDisabled && (
                <label htmlFor={props.name} className="block mb-5">
                    {label}:
                </label>
            )}
            <select className={classNames("select w-full", error && 'select-error')} {...props}>
                <option disabled selected>{props.placeholder}</option>
                {options.map((option) => (
                    <option>{option}</option>
                ))}
            </select>
        </div>
    )
}
