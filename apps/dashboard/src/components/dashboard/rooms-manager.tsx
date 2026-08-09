'use client'

import { useController } from '@nemu/controller'
import type { Room } from '@nemu/protocol'
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@nemu/ui/components/alert-dialog'
import { Button } from '@nemu/ui/components/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@nemu/ui/components/card'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@nemu/ui/components/empty'
import { Input } from '@nemu/ui/components/input'
import { Skeleton } from '@nemu/ui/components/skeleton'
import {
    DoorOpenIcon,
    LoaderCircleIcon,
    PencilIcon,
    PlusIcon,
    RefreshCwIcon,
    ServerOffIcon,
    Trash2Icon,
    TriangleAlertIcon,
} from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'

export function RoomsManager() {
    const { status, reprobe, getRooms, createRoom, patchRoom, deleteRoom } =
        useController()
    const [rooms, setRooms] = useState<Room[] | undefined>(undefined)
    const [error, setError] = useState<Error | null>(null)
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<Error | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [savingId, setSavingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [actionError, setActionError] = useState<Error | null>(null)
    const [deleteOpenId, setDeleteOpenId] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        if (status.mode !== 'lan') {
            setRooms(undefined)
            return
        }
        try {
            const next = await getRooms()
            setRooms(next)
            setError(null)
        } catch (nextError) {
            setError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        }
    }, [getRooms, status.mode])

    useEffect(() => {
        void refresh()
    }, [refresh])

    async function handleCreate(event: FormEvent) {
        event.preventDefault()
        const name = newName.trim()
        if (!name) return
        setCreating(true)
        setCreateError(null)
        try {
            await createRoom({ name })
            setNewName('')
            await refresh()
        } catch (nextError) {
            setCreateError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        } finally {
            setCreating(false)
        }
    }

    async function handleRename(roomId: string) {
        const name = editName.trim()
        if (!name) return
        setSavingId(roomId)
        setActionError(null)
        try {
            await patchRoom(roomId, { name })
            setEditingId(null)
            await refresh()
        } catch (nextError) {
            setActionError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        } finally {
            setSavingId(null)
        }
    }

    async function handleDelete(roomId: string) {
        setDeletingId(roomId)
        setActionError(null)
        try {
            await deleteRoom(roomId)
            setDeleteOpenId(null)
            await refresh()
        } catch (nextError) {
            setActionError(
                nextError instanceof Error
                    ? nextError
                    : new Error(String(nextError))
            )
        } finally {
            setDeletingId(null)
        }
    }

    if (status.mode !== 'lan') {
        return (
            <Card>
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <ServerOffIcon />
                        </EmptyMedia>
                        <EmptyTitle>Home connection required</EmptyTitle>
                        <EmptyDescription>
                            Creating and editing rooms needs a direct connection
                            to your Nemu controller.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button
                            onClick={() => void reprobe()}
                            size="sm"
                            variant="outline"
                        >
                            <RefreshCwIcon data-icon="inline-start" />
                            Reconnect
                        </Button>
                    </EmptyContent>
                </Empty>
            </Card>
        )
    }

    if (!rooms && error) {
        return (
            <Card>
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <TriangleAlertIcon />
                        </EmptyMedia>
                        <EmptyTitle>Unable to load rooms</EmptyTitle>
                        <EmptyDescription>{error.message}</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button
                            onClick={() => void refresh()}
                            size="sm"
                            variant="outline"
                        >
                            <RefreshCwIcon data-icon="inline-start" />
                            Try again
                        </Button>
                    </EmptyContent>
                </Empty>
            </Card>
        )
    }

    if (!rooms) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <Card>
                <CardHeader>
                    <CardTitle>Add room</CardTitle>
                    <CardDescription>
                        Group devices by where they live in your home.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-col gap-3 sm:flex-row"
                        onSubmit={(event) => void handleCreate(event)}
                    >
                        <Input
                            aria-label="New room name"
                            disabled={creating}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder="Living room"
                            value={newName}
                        />
                        <Button
                            disabled={creating || newName.trim().length === 0}
                            type="submit"
                        >
                            {creating ? (
                                <LoaderCircleIcon
                                    className="animate-spin"
                                    data-icon="inline-start"
                                />
                            ) : (
                                <PlusIcon data-icon="inline-start" />
                            )}
                            {creating ? 'Creating…' : 'Create'}
                        </Button>
                    </form>
                    {createError ? (
                        <p
                            className="mt-3 text-destructive text-sm"
                            role="alert"
                        >
                            {createError.message}
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Your rooms</CardTitle>
                    <CardDescription>
                        Rename or remove rooms. Devices in a deleted room become
                        unassigned.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {actionError ? (
                        <div
                            className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive text-sm"
                            role="alert"
                        >
                            {actionError.message}
                        </div>
                    ) : null}

                    {rooms.length === 0 ? (
                        <Empty className="border border-dashed">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <DoorOpenIcon />
                                </EmptyMedia>
                                <EmptyTitle>No rooms yet</EmptyTitle>
                                <EmptyDescription>
                                    Create a room above, then assign devices
                                    from their detail page.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        rooms.map((room) => {
                            const isEditing = editingId === room.id
                            const isSaving = savingId === room.id
                            const isDeleting = deletingId === room.id

                            return (
                                <div
                                    className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                                    key={room.id}
                                >
                                    {isEditing ? (
                                        <Input
                                            aria-label={`Rename ${room.name}`}
                                            autoFocus
                                            disabled={isSaving}
                                            onChange={(event) =>
                                                setEditName(event.target.value)
                                            }
                                            value={editName}
                                        />
                                    ) : (
                                        <div>
                                            <p className="font-medium text-sm">
                                                {room.name}
                                            </p>
                                            <p className="text-muted-foreground text-xs">
                                                {room.id}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        {isEditing ? (
                                            <>
                                                <Button
                                                    disabled={
                                                        isSaving ||
                                                        editName.trim()
                                                            .length === 0
                                                    }
                                                    onClick={() =>
                                                        void handleRename(
                                                            room.id
                                                        )
                                                    }
                                                    size="sm"
                                                >
                                                    {isSaving
                                                        ? 'Saving…'
                                                        : 'Save'}
                                                </Button>
                                                <Button
                                                    disabled={isSaving}
                                                    onClick={() => {
                                                        setEditingId(null)
                                                        setEditName('')
                                                    }}
                                                    size="sm"
                                                    variant="ghost"
                                                >
                                                    Cancel
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                onClick={() => {
                                                    setEditingId(room.id)
                                                    setEditName(room.name)
                                                    setActionError(null)
                                                }}
                                                size="sm"
                                                variant="outline"
                                            >
                                                <PencilIcon data-icon="inline-start" />
                                                Rename
                                            </Button>
                                        )}

                                        <AlertDialog
                                            onOpenChange={(open) => {
                                                if (!isDeleting) {
                                                    setDeleteOpenId(
                                                        open ? room.id : null
                                                    )
                                                    if (!open)
                                                        setActionError(null)
                                                }
                                            }}
                                            open={deleteOpenId === room.id}
                                        >
                                            <AlertDialogTrigger asChild>
                                                <Button
                                                    disabled={isEditing}
                                                    size="sm"
                                                    variant="destructive"
                                                >
                                                    <Trash2Icon data-icon="inline-start" />
                                                    Delete
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogMedia>
                                                        <Trash2Icon />
                                                    </AlertDialogMedia>
                                                    <AlertDialogTitle>
                                                        Delete {room.name}?
                                                    </AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Devices assigned to this
                                                        room will become
                                                        unassigned. You can
                                                        reassign them later.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel
                                                        disabled={isDeleting}
                                                    >
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <Button
                                                        disabled={isDeleting}
                                                        onClick={() =>
                                                            void handleDelete(
                                                                room.id
                                                            )
                                                        }
                                                        variant="destructive"
                                                    >
                                                        {isDeleting ? (
                                                            <LoaderCircleIcon
                                                                className="animate-spin"
                                                                data-icon="inline-start"
                                                            />
                                                        ) : (
                                                            <Trash2Icon data-icon="inline-start" />
                                                        )}
                                                        {isDeleting
                                                            ? 'Deleting…'
                                                            : 'Delete room'}
                                                    </Button>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
