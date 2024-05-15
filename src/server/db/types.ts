import { customType, pgEnum } from 'drizzle-orm/pg-core'
import {
    CommissionAvailability,
    InvoiceStatus,
    RequestStatus,
    SocialAccount,
    SocialAgent,
    UserRole
} from '~/core/structures'

const enum_to_pg_enum = (m_Enum: any) =>
    Object.values(m_Enum).map((value: any) => `${value}`) as [string, ...string[]]

/**
 * Custom Id Type
 */
export const cuidType = customType<{ data: string; default: true; notNull: true }>({
    dataType: () => 'text',
    toDriver: (value) => value
})

export const cuid = (name: string) => cuidType(name)

/**
 * Creates a custom json schema type
 *
 * @param name - name of the coloumn
 * @returns
 */
export const customJson = <TData>(name: string) =>
    customType<{ data: TData; driverData: string }>({
        dataType: () => 'json',
        toDriver: (value: TData) => JSON.stringify(value),
        // fromDriver: (value: string) => JSON.parse(value) as TData
    })(name)

/**
 * An Enumeration for the user roles
 */
export const UserRoleEnum = pgEnum('UserRole', enum_to_pg_enum(UserRole))

/**
 * Enumeration for the different social agents
 */
export const SocialAgentEnum = pgEnum('SocialAgent', enum_to_pg_enum(SocialAgent))

/**
 * Enumeration for the different invoice statuses
 */
export const InvoiceStatusEnum = pgEnum('InvoiceStatus', enum_to_pg_enum(InvoiceStatus))

/**
 * An Enumeration for the Request Status
 */
export const RequestStatusEnum = pgEnum('RequestStatus', enum_to_pg_enum(RequestStatus))

/**
 * An Enumeration for the Commission Availability
 */
export const CommissionAvailabilityEnum = pgEnum(
    'CommissionAvailability',
    enum_to_pg_enum(CommissionAvailability)
)
