import { useAuth } from '@clerk/expo'
import { UserProfileView } from '@clerk/expo/native-components'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

export default function AccountScreen() {
    const { isLoaded, isSignedIn } = useAuth({
        treatPendingAsSignedOut: false,
    })
    const router = useRouter()

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.replace('/welcome')
        }
    }, [isLoaded, isSignedIn, router])

    return (
        <View className="flex-1 bg-background">
            <UserProfileView
                isDismissible={false}
                onHostBack={() => router.back()}
                style={{ flex: 1 }}
            />
        </View>
    )
}
