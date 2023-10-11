import CheckboxInput from "@/components/ArtistVerification/CheckboxInput";
import VertificationStep from "@/components/ArtistVerification/VerificationStep";

export default function VerificationStepTwo() {
    return (
        <VertificationStep back="/artists/apply/step-one" next="/artists/apply/step-three" >
            <CheckboxInput />
        </VertificationStep>
    )
}