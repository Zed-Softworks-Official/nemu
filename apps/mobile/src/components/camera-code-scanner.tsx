import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRef } from 'react'
import { Linking, View } from 'react-native'

import type { CodeScanner } from '~/components/add-device'
import { Button } from '~/components/ui/button'
import { Text } from '~/components/ui/text'

/** Seconds before the same QR code is read again after a rejected scan. */
const RESCAN_MS = 2_000

/**
 * Scans QR codes with the phone camera for Matter commissioning. Kept apart
 * from the commissioning flow so tests can replace it, and so typed codes
 * work without a camera.
 */
export const CameraCodeScanner: CodeScanner = ({ onCode }) => {
    const [permission, requestPermission] = useCameraPermissions()
    const last = useRef<{ data: string; at: number } | null>(null)

    if (!permission) return null

    if (!permission.granted) {
        return (
            <View className="gap-3 rounded-sm border border-border p-4">
                <Text className="text-muted-foreground text-sm leading-relaxed">
                    Allow camera access to scan the Device’s Matter QR code. You
                    can also type its pairing code.
                </Text>
                <View className="flex-row">
                    {permission.canAskAgain ? (
                        <Button
                            onPress={() => void requestPermission()}
                            title="Allow camera"
                        />
                    ) : (
                        <Button
                            onPress={() => void Linking.openSettings()}
                            title="Open Settings"
                            variant="outline"
                        />
                    )}
                </View>
            </View>
        )
    }

    return (
        <View className="aspect-square w-full overflow-hidden rounded-sm border border-border">
            <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                facing="back"
                onBarcodeScanned={({ data }) => {
                    const now = Date.now()
                    const previous = last.current
                    if (
                        previous?.data === data &&
                        now - previous.at < RESCAN_MS
                    ) {
                        return
                    }
                    last.current = { data, at: now }
                    onCode(data)
                }}
                style={{ flex: 1 }}
            />
        </View>
    )
}
