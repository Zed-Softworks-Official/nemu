'use client'

import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { useThemeContext } from './theme-context'
import { ChangeEvent } from 'react'
import classNames from '@/helpers/classnames'

export default function ThemeSwitcher({ active }: { active?: boolean }) {
    const { theme, setTheme } = useThemeContext()

    function isDark() {
        return theme === 'dark'
    }

    function toggleTheme(event: ChangeEvent<HTMLInputElement>) {
        setTheme!(event.target.checked ? 'dark' : 'light')
    }

    return (
        <label className="text-charcoal dark:text-white hover:bg-white hover:dark:bg-charcoal hover:dark:text-white block px-5 py-2 text-sm cursor-pointer">
            {!isDark() ? (
                <MoonIcon className="user-menu-item-icon" />
            ) : (
                <SunIcon className="user-menu-item-icon" />
            )}
            {!isDark() ? 'Dark Mode' : 'Light Mode'}
            <input
                type="checkbox"
                className="hidden"
                checked={isDark()}
                onChange={(e) => toggleTheme(e)}
            />
        </label>
    )
}
