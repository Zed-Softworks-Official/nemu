import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { DeviceSheet } from '~/components/device-sheet'
import { useCloseSheet } from '~/components/use-close-sheet'

/** The Device sheet, presented natively by the tab Stack's layout. */
export default function DeviceSheetRoute() {
    const { deviceId } = useLocalSearchParams<{ deviceId: string }>()
    const close = useCloseSheet()
    return (
        <View className="flex-1 bg-background">
            <DeviceSheet deviceId={deviceId} onClose={close} />
        </View>
    )
}
