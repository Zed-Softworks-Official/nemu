export function normalizeEmail(email: string | undefined): string | null {
    if (!email) return null
    const normalized = email.trim().toLowerCase()
    if (
        !normalized.includes('@') ||
        normalized.startsWith('@') ||
        normalized.endsWith('@')
    ) {
        return null
    }
    return normalized
}
