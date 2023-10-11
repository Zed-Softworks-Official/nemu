import VerificationOption from "@/components/ArtistVerification/VerificationOption";
import VertificationStep from "@/components/ArtistVerification/VerificationStep";

export default function VerificationStepTwo() {
    return (
        <VertificationStep back="/artists/apply/step-one" next="/artists/apply/step-three" >
            <VerificationOption />
        </VertificationStep>
    )
}