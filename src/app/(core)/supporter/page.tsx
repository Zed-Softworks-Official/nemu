import PricingCards from '~/components/pricing-cards'

export default function GetSupporterPage() {
    return (
        <div className="container mx-auto mt-10 flex max-w-4xl flex-col items-center justify-center gap-2">
            <h1 className="text-3xl font-bold">Become a Supporter</h1>

            <p className="text-lg text-muted-foreground">
                Join us in shaping the future of Nemu while enjoying the benefits of being
                a valued supporter!
            </p>

            <div className="mt-20 flex w-full flex-col gap-2">
                <PricingCards />
                <p className="text-md italic text-muted-foreground">
                    Nemu is free to use, but as a small team, we need your help to keep
                    the lights on and keep things rolling smoothly. If you enjoy using
                    Nemu, please consider supporting us—your contribution helps fuel our
                    development!
                </p>
            </div>
        </div>
    )
}
