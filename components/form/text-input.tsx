import classNames from '@/core/helpers'
import { InputHTMLAttributes } from 'react'

export default function TextInput({
    label,
    labelDisabled,
    error,
    ...props
}: {
    label: string
    error?: boolean
    labelDisabled?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div className="mb-5">
            {!labelDisabled && (
                <label htmlFor={props.name} className="block mb-5">
                    {label}:
                </label>
            )}
            <input
                {...props}
                className={classNames(error && 'input-error', 'input w-full')}
            />
        </div>
    )
}
