import { useController } from '@nemu/controller'
import type { SessionRole } from '@nemu/protocol'
import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from 'react'

/** `undefined` means no provider; `null` means the role is unknown. */
const MembershipRoleContext = createContext<SessionRole | null | undefined>(
    undefined
)

/**
 * Reads this session's Membership role from the Controller over LAN or Relay
 * (NEM-86) once for everything below it, and again whenever the transport
 * changes, so a reconnect picks up a role changed on the Controller.
 */
export function MembershipRoleProvider({ children }: { children: ReactNode }) {
    const { status, getSession } = useController()
    const live = status.mode === 'lan' || status.mode === 'relay'
    const [role, setRole] = useState<SessionRole | null>(null)

    useEffect(() => {
        setRole(null)
        if (!live) return
        let current = true
        getSession().then(
            (session) => {
                if (current) setRole(session.role)
            },
            () => {
                if (current) setRole(null)
            }
        )
        return () => {
            current = false
        }
    }, [live, getSession, status.mode])

    return (
        <MembershipRoleContext.Provider value={role}>
            {children}
        </MembershipRoleContext.Provider>
    )
}

/**
 * This session's Membership role, or `null` while unknown: offline, still
 * reading, or refused.
 *
 * Use it only to decide what to show. The Controller still enforces every
 * permission, and an unknown role hides Owner-only parts.
 */
export function useMembershipRole(): SessionRole | null {
    const role = useContext(MembershipRoleContext)
    if (role === undefined) {
        throw new Error(
            'useMembershipRole must be used inside a MembershipRoleProvider'
        )
    }
    return role
}

/**
 * Renders `children` only for an Owner. Nothing shows while the role is
 * unknown, so Owner-only parts never flash for a Member.
 */
export function OwnerOnly({ children }: { children: ReactNode }) {
    return useMembershipRole() === 'owner' ? <>{children}</> : null
}
