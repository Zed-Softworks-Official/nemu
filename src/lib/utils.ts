import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import {
    Id,
    ToastContent,
    ToastOptions,
    UpdateOptions,
    toast
} from 'react-toastify'
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
 * @param {ToastContent<T>} content
 * @param opts
 * @returns
 */
export function nemu_toast<T>(content: ToastContent<T>, opts?: ToastOptions<T>) {
    return toast(content, { ...opts })
}

/**
 *
 */
export namespace nemu_toast {
    /**
     *
     * @param content
     * @param opts
     * @returns
     */
    export function loading<T>(content: ToastContent<T>, opts?: ToastOptions<T>) {
        return toast.loading(content, { ...opts })
    }

    /**
     *
     * @param toast_id
     * @param opts
     * @returns
     */
    export function update(toast_id: Id, opts?: UpdateOptions) {
        return toast.update(toast_id, { ...opts })
    }
}
