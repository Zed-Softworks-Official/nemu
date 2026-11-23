export function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour >= 4 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 18) return 'Good afternoon'
    return 'Good evening'
}

export function getToday(): string {
    return new Intl.DateTimeFormat('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(new Date())
}
