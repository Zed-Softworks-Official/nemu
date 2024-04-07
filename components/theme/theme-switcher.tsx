'use client'

import { ChangeEvent } from 'react'
import { useThemeContext } from './theme-context'
import { MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { cn } from '@/lib/utils'

export default function ThemeSwitcher({ active }: { active?: boolean }) {
    const { theme, setTheme } = useThemeContext()

    function toggleTheme(event: ChangeEvent<HTMLInputElement>) {
        setTheme!(event.target.checked ? 'nemu-light' : 'nemu-dark')
    }

    return (
        <label className="swap swap-rotate px-5 py-2 text-sm cursor-pointer w-full">
            {/* this hidden checkbox controls the state */}
            <input
                type="checkbox"
                className="theme-controller"
                value={'nemu-light'}
                onChange={(e) => toggleTheme(e)}
            />

            {/* sun icon */}
            <SunIcon className={cn('swap-off fill-current w-6 h-6 inline-grid')} />

            {/* moon icon */}
            <MoonIcon className={cn('swap-on fill-current w-6 h-6 inline-grid')} />
        </label>
    )
}
