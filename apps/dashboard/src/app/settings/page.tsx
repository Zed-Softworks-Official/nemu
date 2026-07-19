import { Badge } from '@nemu/ui/components/badge'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import { Input } from '@nemu/ui/components/input'
import { Separator } from '@nemu/ui/components/separator'
import { Switch } from '@nemu/ui/components/switch'
import {
    LaptopIcon,
    RadioTowerIcon,
    RotateCwIcon,
    SmartphoneIcon,
} from 'lucide-react'
import { PageHeader } from '~/components/dashboard/page-header'

export default function SettingsPage() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <PageHeader
                description="Manage your controller, connections, and dashboard preferences."
                title="Settings"
            />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Controller</CardTitle>
                            <CardDescription>
                                The Nemu controller this dashboard connects to.
                            </CardDescription>
                            <CardAction>
                                <Badge variant="soft">Online</Badge>
                            </CardAction>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-2">
                                <label
                                    className="font-medium text-sm"
                                    htmlFor="controller-name"
                                >
                                    Controller name
                                </label>
                                <Input
                                    defaultValue="Nemu Home"
                                    id="controller-name"
                                />
                                <p className="text-muted-foreground text-xs">
                                    Shown when pairing a new client.
                                </p>
                            </div>
                            <Separator />
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-muted-foreground text-xs">
                                        Local address
                                    </p>
                                    <p className="mt-1 font-medium text-sm">
                                        nemu.local
                                    </p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground text-xs">
                                        Controller ID
                                    </p>
                                    <p className="mt-1 font-mono text-sm">
                                        nemu_8f2c…91a4
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end border-t">
                            <Button size="sm">Save changes</Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Connection</CardTitle>
                            <CardDescription>
                                Nemu prefers your private LAN and falls back to
                                the relay when you are away.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <RadioTowerIcon className="size-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">
                                            Prefer local connection
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            Keep device traffic inside your home
                                            when available.
                                        </p>
                                    </div>
                                </div>
                                <Switch
                                    aria-label="Prefer local connection"
                                    defaultChecked
                                />
                            </div>
                            <Separator />
                            <Button size="sm" variant="outline">
                                <RotateCwIcon data-icon="inline-start" />
                                Test connection
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>Paired clients</CardTitle>
                            <CardDescription>
                                Devices currently trusted by your controller.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ClientRow
                                detail="This browser · Active now"
                                icon={LaptopIcon}
                                name="Arch desktop"
                            />
                            <Separator />
                            <ClientRow
                                detail="Last active 2 hours ago"
                                icon={SmartphoneIcon}
                                name="Jack's phone"
                            />
                        </CardContent>
                        <CardFooter className="border-t">
                            <Button className="px-0" size="sm" variant="link">
                                Manage paired clients
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>
                                Keep the dashboard comfortable in your space.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-4">
                            <div>
                                <p className="font-medium text-sm">
                                    Use system theme
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    Dark mode remains the default.
                                </p>
                            </div>
                            <Switch
                                aria-label="Use system theme"
                                defaultChecked
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Unpair controller</CardTitle>
                            <CardDescription>
                                Remove local credentials from this dashboard.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button size="sm" variant="destructive">
                                Unpair this dashboard
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function ClientRow({
    name,
    detail,
    icon: Icon,
}: {
    name: string
    detail: string
    icon: typeof LaptopIcon
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-4" />
            </div>
            <div className="min-w-0">
                <p className="truncate font-medium text-sm">{name}</p>
                <p className="truncate text-muted-foreground text-xs">
                    {detail}
                </p>
            </div>
        </div>
    )
}
