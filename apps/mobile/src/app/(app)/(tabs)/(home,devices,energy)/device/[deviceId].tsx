import { useLocalSearchParams, useRouter } from 'expo-router'
import { View } from 'react-native'

import { DeviceSheet } from '~/components/device-sheet'

/** The Device sheet, presented natively by the tab Stack's layout. */
export default function DeviceSheetRoute() {
    const { deviceId } = useLocalSearchParams<{ deviceId: string }>()
    const router = useRouter()
    return (
        <View className="flex-1 bg-background">
            <DeviceSheet deviceId={deviceId} onClose={() => router.back()} />
        </View>
    )
}
