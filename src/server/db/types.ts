import { customType, mysqlEnum } from 'drizzle-orm/mysql-core'
import {
    CommissionAvailability,
    InvoiceStatus,
    RequestStatus,
    SocialAgent,
    UserRole
} from '~/core/structures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const enum_to_mysql_enum = (m_Enum: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    Object.values(m_Enum).map((value: any) => `${value}`) as [string, ...string[]]

/**
 * Creates a custom json schema type
 *
 * @param name - name of the coloumn
 * @returns
 */
export const customJson = <TData>(name: string) =>
    customType<{ data: TData; driverData: string }>({
        dataType: () => 'json',
        toDriver: (value: TData) => JSON.stringify(value)
        // fromDriver: (value: string) => JSON.parse(value) as TData
    })(name)

/**
 * An Enumeration for the user roles
 */
export const UserRoleEnum = (name: string) =>
    mysqlEnum(name, enum_to_mysql_enum(UserRole))

/**
 * Enumeration for the different social agents
 */
export const SocialAgentEnum = (name: string) =>
    mysqlEnum(name, enum_to_mysql_enum(SocialAgent))

/**
 * Enumeration for the different invoice statuses
 */
export const InvoiceStatusEnum = (name: string) =>
    mysqlEnum(name, enum_to_mysql_enum(InvoiceStatus))

/**
 * An Enumeration for the Request Status
 */
export const RequestStatusEnum = (name: string) =>
    mysqlEnum(name, enum_to_mysql_enum(RequestStatus))

/**
 * An Enumeration for the Commission Availability
 */
export const CommissionAvailabilityEnum = (name: string) =>
    mysqlEnum(name, enum_to_mysql_enum(CommissionAvailability))
