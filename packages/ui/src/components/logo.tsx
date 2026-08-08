import logoDark from '@nemu/assets/logos/logo-dark.png'
import logoLight from '@nemu/assets/logos/logo-light.png'
import { cn } from '@nemu/ui/lib/utils'
import Image, { type ImageProps } from 'next/image'
import { Fragment } from 'react'

/** Native logo asset ratio (4147×1626). */
const LOGO_ASPECT = 4147 / 1626

type LogoProps = Omit<ImageProps, 'src' | 'alt'>

export function Logo({
    height = 40,
    width,
    className,
    ...props
}: LogoProps = {}) {
    const resolvedHeight = typeof height === 'number' ? height : 40
    const resolvedWidth =
        typeof width === 'number'
            ? width
            : Math.round(resolvedHeight * LOGO_ASPECT)

    return (
        <Fragment>
            <Image
                alt="Nemu Logo"
                className={cn('hidden h-auto w-auto dark:block', className)}
                height={resolvedHeight}
                src={logoDark}
                width={resolvedWidth}
                {...props}
            />
            <Image
                alt="Nemu Logo"
                aria-hidden
                className={cn('h-auto w-auto dark:hidden', className)}
                height={resolvedHeight}
                src={logoLight}
                width={resolvedWidth}
                {...props}
            />
        </Fragment>
    )
}
