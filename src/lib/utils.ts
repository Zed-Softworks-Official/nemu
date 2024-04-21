import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { Id, ToastContent, ToastOptions, UpdateOptions, toast } from 'react-toastify'
import { useTheme } from 'next-themes'

/**
 * Merges classnames
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Wrapper for toast
 *
 * @param {ToastContent<T>} content - The content you wish to render
 * @param {ToastOptions<T>} opts - Options for the toast
 * @returns {Id} - Toast id
 */
export function nemu_toast<T>(content: ToastContent<T>, opts?: ToastOptions<T>) {
    return toast(content, { ...opts })
}

/**
 *
 */
export namespace nemu_toast {
    /**
     * Creates a toast to be used for promises
     *
     * @param {ToastContent<T>} content - The content you wish to render
     * @param {ToastOptions<T>} opts - Options for the toast
     * @returns - Toast Id
     */
    export function loading<T>(content: ToastContent<T>, opts?: ToastOptions<T>) {
        return toast.loading(content, { ...opts })
    }

    /**
     * Updates a toast given an id
     *
     * @param {Id} toast_id - The id for the toast
     * @param {UpdateOptions} opts - What you wish to update
     */
    export function update(toast_id: Id, opts?: UpdateOptions) {
        return toast.update(toast_id, { ...opts })
    }
}

/**
 * Formats a number to be in "Price Format", currently only for US
 * 
 * @param {number} number - The number you wish to convert
 * @returns {string} - A string with the correct format for pricing
 */
export function format_to_currency(number: number) {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    })

    return formatter.format(number)
}
