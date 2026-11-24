import { useRouter } from 'expo-router'
import { View } from 'react-native'

import { MembershipRoleProvider } from '~/components/membership-role'
import { UpdateSheet } from '~/components/update-sheet'

/** The update confirmation sheet, presented by the tab Stack's layout. */
export default function UpdateSheetRoute() {
    const router = useRouter()
    return (
        <MembershipRoleProvider>
            <View className="flex-1 bg-background">
                <UpdateSheet onClose={() => router.back()} />
            </View>
        </MembershipRoleProvider>
    )
}
