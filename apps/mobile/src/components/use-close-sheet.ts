import { useNavigation, useRouter } from 'expo-router'
import { useCallback } from 'react'

/**
 * Closes the sheet route it is called from. Does nothing once the person
 * has already dismissed the sheet, so an action that finishes late never
 * closes the screen behind it.
 */
export function useCloseSheet(): () => void {
    const navigation = useNavigation()
    const router = useRouter()
    return useCallback(() => {
        if (navigation.isFocused()) router.back()
    }, [navigation, router])
}
