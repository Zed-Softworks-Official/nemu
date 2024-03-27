import { SearchParamType, SearchType } from './structures'

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

export function SearchTypeToAlgoliaIndex(type: SearchType) {
    switch (type) {
        case SearchType.Artist:
            return 'artists'
        case SearchType.Commission:
            return 'commissions'
    }

    return 'products'
}

export function SearchTypeToSearchParam(type: SearchType): SearchParamType {
    switch (type) {
        case SearchType.Artist:
            return 'artist'
        case SearchType.Commission:
            return 'commission'
        case SearchType.FreeAsset:
            return 'freeasset'
        case SearchType.PaidAsset:
            return 'paidasset'
    }
}

export function SearchParamToSearchType(type: SearchParamType): SearchType {
    switch (type) {
        case 'artist':
            return SearchType.Artist
        case 'commission':
            return SearchType.Commission
        case 'freeasset':
            return SearchType.FreeAsset
        case 'paidasset':
            return SearchType.PaidAsset
    }
}

export function SearchPhrase(type: SearchType) {
    if (type == SearchType.Artist) {
        return `an ${SearchTypeToString(type)}`
    }

    return `a ${SearchTypeToString(type)}`
}
