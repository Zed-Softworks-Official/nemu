import { allCountries } from 'country-region-data'
import * as SelectPrimitive from '@radix-ui/react-select'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '~/components/ui/select'

export default function SelectCountries(props: SelectPrimitive.SelectProps) {
    return (
        <Select {...props}>
            <SelectTrigger className="w-full">
                <SelectValue placeholder="Select your location" />
            </SelectTrigger>
            <SelectContent>
                {allCountries.map((country) => (
                    <SelectItem key={country[1]} value={country[0]}>
                        {country[0]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
