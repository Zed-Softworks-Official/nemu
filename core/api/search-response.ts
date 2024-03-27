import { Artist, Commission, Product } from '@prisma/client'
import { NemuResponse } from './base-response'
import { SearchResult } from '../structures'

export interface SearchResponse extends NemuResponse {
    search_result?: SearchResult[]
}
