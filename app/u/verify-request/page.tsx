import NemuImage from "@/components/nemu-image";

export default function VerifyRequest() {
    return (
        <div className="flex flex-col justify-center items-center gap-2">
            <NemuImage src={'/nemu/sparkles.png'} alt="nemu wow" width={100} height={100} />
            <h1 className="font-bold">Check Your Email</h1>
            <p>A sign in link has been sent to your email address.</p>
        </div>
    )
} 