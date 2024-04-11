import { RouterOutput } from './base-response'

export type CommissionsResponse = RouterOutput['commissions']['get_commission']
export type CommissionEditableResponse =
    RouterOutput['commissions']['get_commission_editable']
