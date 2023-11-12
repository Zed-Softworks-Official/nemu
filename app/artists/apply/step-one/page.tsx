import VerificationInfo from '@/components/ArtistVerification/steps/verification-info'
import VertificationStep from '@/components/ArtistVerification/layout/verification-step'

export default function VerificationStepOne() {
    return (
        <VertificationStep back="" next="/artists/apply/step-two" home>
            <VerificationInfo />
        </VertificationStep>
    )
}
