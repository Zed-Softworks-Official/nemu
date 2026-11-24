import { useRouter } from 'expo-router'
import { View } from 'react-native'

import { AddDeviceSheet } from '~/components/add-device'
import { CameraCodeScanner } from '~/components/camera-code-scanner'

/** The add-Device sheet, presented natively by the tab Stack's layout. */
export default function AddDeviceSheetRoute() {
    const router = useRouter()
    return (
        <View className="flex-1 bg-background">
            <AddDeviceSheet
                onClose={() => router.back()}
                Scanner={CameraCodeScanner}
            />
        </View>
    )
}
