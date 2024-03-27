export enum SearchType {
    Commission,
    PaidAsset,
    FreeAsset,
    Artist
}

export type SearchParamType = 'artist' | 'commission' | 'paidasset' | 'freeasset'

export interface SearchResult {
    type: SearchType
    handle?: string
    title?: string
    image?: string
    url?: string
    price?: number
}
