'use client'

import {
    Dispatch,
    SetStateAction,
    createContext,
    useContext,
    useEffect,
    useState
} from 'react'

type ThemeType = 'nemu-dark' | 'nemu-light'

export function GetInitialTheme(): ThemeType {
    if (typeof window !== 'undefined' && window.localStorage) {
        const storedPrefs = window.localStorage.getItem('color-theme')

        if (typeof storedPrefs === 'string') {
            return storedPrefs as ThemeType
        }

        const userMedia = window.matchMedia('(prefers-color-scheme: dark)')
        if (userMedia.matches) {
            return 'nemu-dark'
        }
    }

    return 'nemu-dark'
}

type ThemeContextType = {
    theme?: ThemeType
    setTheme?: Dispatch<SetStateAction<ThemeType>>
}

const ThemeContext = createContext<ThemeContextType>({})

export default function ThemeProvider({
    children
}: {
    children: React.ReactNode
}) {
    const [theme, setTheme] = useState<ThemeType>(GetInitialTheme())

    function rawSetTheme(theme: string) {
        document.querySelector('html')?.setAttribute('data-theme', theme)

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
