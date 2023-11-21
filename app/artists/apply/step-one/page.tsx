import VerificationInfo from '@/components/artist-verification/steps/verification-info'
import VertificationStep from '@/components/artist-verification/layout/verification-step'

export default function VerificationStepOne() {
    return (
        <VertificationStep back="" next="/artists/apply/step-two" home>
            <VerificationInfo />
        </VertificationStep>
    )
}
