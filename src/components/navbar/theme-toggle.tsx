'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '~/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/utils'

export default function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                    <Sun
                        className={cn(
                            'h-[1.2rem] w-[1.2rem] transition-all duration-200',
                            resolvedTheme === 'light'
                                ? 'rotate-0 scale-100'
                                : 'rotate-90 scale-0'
                        )}
                    />
                    <Moon
                        className={cn(
                            'absolute h-[1.2rem] w-[1.2rem] transition-all duration-200',
                            resolvedTheme === 'dark'
                                ? 'rotate-0 scale-100'
                                : 'rotate-90 scale-0'
                        )}
                    />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')}>
                    Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>
                    System
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
