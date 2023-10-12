import VerificationInfo from "@/components/ArtistVerification/Steps/VerificationInfo";
import VertificationStep from "@/components/ArtistVerification/VerificationStep";

export default function VerificationStepOne() {
    return (
        <VertificationStep back="" next="/artists/apply/step-two" home >
            <VerificationInfo />
        </VertificationStep>
    )
}