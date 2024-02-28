import { ClassNames } from '@/core/helpers'
import { CurrencyDollarIcon } from '@heroicons/react/20/solid'
import { InputHTMLAttributes, forwardRef } from 'react'
import { LuPercent } from 'react-icons/lu'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label: string
    additionalClassnames?: string
    error?: boolean
    labelDisabled?: boolean
    percentage?: boolean
}

const CurrencyField = forwardRef<HTMLInputElement, InputProps>(({ label, error, labelDisabled, additionalClassnames, percentage, ...props }, ref) => {
    return (
        <>
            <div className="form-control">
                {!labelDisabled && <label className="label">{label}:</label>}
                <div className="join">
                    <div className="join-item flex jutify-center items-center px-5 bg-base-200">
                        {percentage ? <LuPercent className="w-6 h-6" /> : <CurrencyDollarIcon className="w-6 h-6" />}
                    </div>
                    <input
                        ref={ref}
                        {...props}
                        type="number"
                        inputMode="numeric"
                        className={ClassNames(error && 'input-error', 'input w-full join-item', additionalClassnames && additionalClassnames)}
                    />
                </div>
            </div>
        </>
    )
})

export default CurrencyField
