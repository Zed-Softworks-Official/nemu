import { SearchType } from '@/components/navigation/standard/search/search-context'

export function SearchTypeToString(type: SearchType) {
    switch (type) {
        case SearchType.Artist:
            return 'Artist'
        case SearchType.Commission:
            return 'Commission'
        case SearchType.FreeAsset:
            return 'Free Asset'
        case SearchType.PaidAsset:
            return 'Paid Asset'
    }
}

export function SearchPhrase(type: SearchType) {
    if (type == SearchType.Artist) {
        return `an ${SearchTypeToString(type)}`
    }

    return `a ${SearchTypeToString(type)}`
}