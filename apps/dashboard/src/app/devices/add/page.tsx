import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import { Separator } from '@nemu/ui/components/separator'
import {
    ArrowLeftIcon,
    CheckIcon,
    LightbulbIcon,
    RadioTowerIcon,
    RotateCwIcon,
} from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '~/components/dashboard/page-header'

const steps = [
    { label: 'Prepare', state: 'complete' },
    { label: 'Discover', state: 'current' },
    { label: 'Configure', state: 'upcoming' },
] as const

export default function AddDevicePage() {
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            <PageHeader
                actions={
                    <Button asChild size="sm" variant="ghost">
                        <Link href="/devices">
                            <ArrowLeftIcon data-icon="inline-start" />
                            Back to devices
                        </Link>
                    </Button>
                }
                description="Put your device in pairing mode. Nemu will discover it locally."
                eyebrow="Add device"
                title="Searching for nearby devices"
            />

            <ol className="grid grid-cols-3 gap-2">
                {steps.map((step, index) => (
                    <li className="flex items-center gap-2" key={step.label}>
                        <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                                step.state === 'complete'
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : step.state === 'current'
                                      ? 'border-primary text-primary'
                                      : 'border-border text-muted-foreground'
                            }`}
                        >
                            {step.state === 'complete' ? (
                                <CheckIcon className="size-3.5" />
                            ) : (
                                index + 1
                            )}
                        </span>
                        <span
                            className={`hidden text-sm sm:inline ${
                                step.state === 'upcoming'
                                    ? 'text-muted-foreground'
                                    : 'font-medium'
                            }`}
                        >
                            {step.label}
                        </span>
                        {index < steps.length - 1 ? (
                            <span className="ml-auto h-px flex-1 bg-border" />
                        ) : null}
                    </li>
                ))}
            </ol>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)]">
                <Card className="min-h-96 justify-between">
                    <CardHeader className="text-center">
                        <div className="relative mx-auto mb-5 flex size-20 items-center justify-center rounded-full border bg-muted/40 text-primary">
                            <span className="absolute inset-2 animate-pulse rounded-full border border-primary/30" />
                            <RadioTowerIcon className="size-7" />
                        </div>
                        <CardTitle className="text-lg">
                            Discovery is ready
                        </CardTitle>
                        <CardDescription className="mx-auto max-w-sm leading-relaxed">
                            Pairing mode will stay open for three minutes once
                            implementation is connected to your controller.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border border-dashed p-4 text-center">
                            <p className="font-medium text-sm">
                                No new devices found yet
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                                Keep the device close to your Nemu controller
                                while it joins.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-center border-t">
                        <Button>
                            <RotateCwIcon data-icon="inline-start" />
                            Start discovery
                        </Button>
                    </CardFooter>
                </Card>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Before you begin</CardTitle>
                            <CardDescription>
                                A few steps help devices join reliably.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Tip
                                detail="Follow its reset instructions until the status light starts blinking."
                                number="1"
                                title="Reset the device"
                            />
                            <Separator />
                            <Tip
                                detail="Place it within a few feet of your Nemu controller for pairing."
                                number="2"
                                title="Bring it nearby"
                            />
                            <Separator />
                            <Tip
                                detail="Leave the device powered while Nemu finishes configuration."
                                number="3"
                                title="Keep it awake"
                            />
                        </CardContent>
                    </Card>

                    <Card size="sm">
                        <CardContent className="flex items-start gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <LightbulbIcon className="size-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm">
                                        Supported devices
                                    </p>
                                    <Badge variant="outline">Zigbee</Badge>
                                </div>
                                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                                    Lights, plugs, switches, and sensors from
                                    common Zigbee manufacturers.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function Tip({
    number,
    title,
    detail,
}: {
    number: string
    title: string
    detail: string
}) {
    return (
        <div className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                {number}
            </span>
            <div>
                <p className="font-medium text-sm">{title}</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                    {detail}
                </p>
            </div>
        </div>
    )
}
