'use client'

import {
    Dispatch,
    SetStateAction,
    createContext,
    useContext,
    useEffect,
    useState
} from 'react'

export function GetInitialTheme() {
    if (typeof window !== 'undefined' && window.localStorage) {
        const storedPrefs = window.localStorage.getItem('color-theme')

        if (typeof storedPrefs === 'string') {
            return storedPrefs
        }

        const userMedia = window.matchMedia('(prefers-color-scheme: dark)')
        if (userMedia.matches) {
            return 'dark'
        }
    }

    return 'dark'
}

type ThemeContextType = {
    theme?: string
    setTheme?: Dispatch<SetStateAction<string>>
}

const ThemeContext = createContext<ThemeContextType>({})

export default function ThemeProvider({
    initial_theme,
    children
}: {
    initial_theme?: string
    children: React.ReactNode
}) {
    const [theme, setTheme] = useState(GetInitialTheme())

    function rawSetTheme(theme: string) {
        const root = window.document.documentElement
        const isDark = theme === 'dark'

        root.classList.remove(isDark ? 'light' : 'dark')
        root.classList.add(theme)

        localStorage.setItem('color-theme', theme)
    }

    useEffect(() => {
        rawSetTheme(theme)
    }, [theme])

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useThemeContext = () => useContext(ThemeContext)
