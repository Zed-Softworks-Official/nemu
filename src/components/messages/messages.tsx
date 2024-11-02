'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import type { GroupChannel } from '@sendbird/chat/groupChannel'

import { ChannelList } from '~/components/messages/channel-list'
import { Channel } from './channel'

const SendbirdProvider = dynamic(() => import('@sendbird/uikit-react/SendbirdProvider'), {
    ssr: false
})

export default function MessagesClient(props: {
    user_id: string
    hide?: boolean
    channel_url?: string
}) {
    const [currentChannel, setCurrentChannel] = useState<GroupChannel | null>(null)

    return (
        <div className="flex h-full w-full flex-row overflow-hidden">
            <SendbirdProvider
                appId="AE781B27-397F-4722-9EC3-13E39266C944"
                userId={props.user_id}
                uikitOptions={{ groupChannel: { enableVoiceMessage: false } }}
            >
                <ChannelList hide={props.hide} setCurrentChannel={setCurrentChannel} />
                <Channel channel={currentChannel} />
            </SendbirdProvider>
        </div>
    )
}

// import { useState, useRef } from 'react'
// import { Button } from '~/components/ui/button'
// import { Input } from '~/components/ui/input'
// import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
// import {
//     Palette,
//     Send,
//     Sparkles,
//     Plus,
//     Image as ImageIcon,
//     X,
//     CornerDownRight,
//     Reply
// } from 'lucide-react'
// import {
//     ContextMenu,
//     ContextMenuContent,
//     ContextMenuItem,
//     ContextMenuTrigger
// } from '~/components/ui/context-menu'
// import {
//     Dialog,
//     DialogContent,
//     DialogHeader,
//     DialogTitle,
//     DialogTrigger,
//     DialogFooter
// } from '~/components/ui/dialog'
// import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
// import { Label } from '~/components/ui/label'
// import { toast } from 'sonner'

// type Message = {
//     id: number
//     sender: 'artist' | 'client'
//     content: string
//     image?: string
//     kanbanStatus?: 'todo' | 'inProgress' | 'done'
//     replyTo?: number
// }

// type Channel = {
//     id: number
//     name: string
//     messages: Message[]
// }

// export default function Component() {
//     const [channels, setChannels] = useState<Channel[]>([
//         {
//             id: 1,
//             name: 'Cat Portrait',
//             messages: [
//                 {
//                     id: 1,
//                     sender: 'artist',
//                     content:
//                         "Hi there! I'm excited to work on your cat portrait. What did you have in mind?"
//                 },
//                 {
//                     id: 2,
//                     sender: 'client',
//                     content:
//                         "Hello! I'd love a colorful portrait of my tabby cat in your unique style!"
//                 }
//             ]
//         },
//         {
//             id: 2,
//             name: 'Landscape Commission',
//             messages: [
//                 {
//                     id: 1,
//                     sender: 'artist',
//                     content:
//                         "Hello! I understand you're interested in a landscape piece. What kind of scene are you looking for?"
//                 },
//                 {
//                     id: 2,
//                     sender: 'client',
//                     content:
//                         "Hi! I'm thinking of a serene mountain lake at sunset. Is that something you'd be comfortable with?"
//                 }
//             ]
//         }
//     ])
//     const [activeChannel, setActiveChannel] = useState(channels[0])
//     const [input, setInput] = useState('')
//     const [selectedImage, setSelectedImage] = useState<File | null>(null)
//     const [replyingTo, setReplyingTo] = useState<number | null>(null)
//     const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)
//     const [selectedKanbanStatus, setSelectedKanbanStatus] = useState<
//         'todo' | 'inProgress' | 'done'
//     >('todo')
//     const [isKanbanDialogOpen, setIsKanbanDialogOpen] = useState(false)
//     const fileInputRef = useRef<HTMLInputElement>(null)

//     const handleSend = async (e: React.FormEvent) => {
//         e.preventDefault()
//         if (input.trim() || selectedImage) {
//             let imageUrl = ''
//             if (selectedImage) {
//                 // In a real application, you would upload the image to a server here
//                 // and get back a URL. For this example, we'll create a local object URL.
//                 imageUrl = URL.createObjectURL(selectedImage)
//             }

//             const newMessage: Message = {
//                 id: activeChannel.messages.length + 1,
//                 sender: 'client',
//                 content: input.trim(),
//                 image: imageUrl,
//                 replyTo: replyingTo
//             }

//             setChannels(
//                 channels.map((channel) =>
//                     channel.id === activeChannel.id
//                         ? { ...channel, messages: [...channel.messages, newMessage] }
//                         : channel
//                 )
//             )
//             setActiveChannel({
//                 ...activeChannel,
//                 messages: [...activeChannel.messages, newMessage]
//             })
//             setInput('')
//             setSelectedImage(null)
//             setReplyingTo(null)
//         }
//     }

//     const addNewChannel = () => {
//         const newChannel: Channel = {
//             id: channels.length + 1,
//             name: `New Commission ${channels.length + 1}`,
//             messages: []
//         }
//         setChannels([...channels, newChannel])
//         setActiveChannel(newChannel)
//     }

//     const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.files && e.target.files[0]) {
//             setSelectedImage(e.target.files[0])
//         }
//     }

//     const updateMessageKanbanStatus = () => {
//         if (selectedMessageId === null) return

//         setChannels(
//             channels.map((channel) => ({
//                 ...channel,
//                 messages: channel.messages.map((message) =>
//                     message.id === selectedMessageId
//                         ? { ...message, kanbanStatus: selectedKanbanStatus }
//                         : message
//                 )
//             }))
//         )
//         setActiveChannel((prevChannel) => ({
//             ...prevChannel,
//             messages: prevChannel.messages.map((message) =>
//                 message.id === selectedMessageId
//                     ? { ...message, kanbanStatus: selectedKanbanStatus }
//                     : message
//             )
//         }))
//         toast.success('Task Updated')
//         setSelectedMessageId(null)
//         setIsKanbanDialogOpen(false)
//     }

//     const handleReply = (messageId: number) => {
//         setReplyingTo(messageId)
//         setInput(`@${messageId} `)
//     }

//     const cancelReply = () => {
//         setReplyingTo(null)
//         setInput('')
//     }

//     const renderMessages = () => {
//         return activeChannel.messages.reduce(
//             (acc: JSX.Element[], message, index, array) => {
//                 const prevMessage = index > 0 ? array[index - 1] : null
//                 const isConnected = prevMessage && prevMessage.sender === message.sender

//                 const messageElement = (
//                     <ContextMenu key={message.id}>
//                         <ContextMenuTrigger>
//                             <div
//                                 className={`flex ${message.sender === 'client' ? 'justify-end' : 'justify-start'} ${isConnected ? 'mt-1' : 'mt-4'}`}
//                             >
//                                 <div
//                                     className={`max-w-[70%] rounded-2xl p-3 ${
//                                         message.sender === 'client'
//                                             ? 'bg-blue-400 text-white'
//                                             : 'bg-pink-200 text-gray-800'
//                                     } ${
//                                         isConnected
//                                             ? message.sender === 'client'
//                                                 ? 'rounded-tr-sm'
//                                                 : 'rounded-tl-sm'
//                                             : message.sender === 'client'
//                                               ? 'rounded-br-none'
//                                               : 'rounded-bl-none'
//                                     }`}
//                                 >
//                                     {message.replyTo && (
//                                         <div className="mb-2 rounded bg-gray-200 bg-opacity-50 p-2 text-sm">
//                                             <CornerDownRight className="mr-1 inline h-4 w-4" />
//                                             <span className="font-semibold">
//                                                 {activeChannel.messages.find(
//                                                     (m) => m.id === message.replyTo
//                                                 )?.sender === 'client'
//                                                     ? 'You'
//                                                     : 'Artist'}
//                                                 :
//                                             </span>{' '}
//                                             {
//                                                 activeChannel.messages.find(
//                                                     (m) => m.id === message.replyTo
//                                                 )?.content
//                                             }
//                                         </div>
//                                     )}
//                                     {message.content}
//                                     {message.image && (
//                                         <img
//                                             src={message.image}
//                                             alt="Attached"
//                                             className="mt-2 h-auto max-w-full rounded-lg"
//                                         />
//                                     )}
//                                     {message.kanbanStatus && (
//                                         <div className="mt-2 text-xs opacity-75">
//                                             Status:{' '}
//                                             {message.kanbanStatus
//                                                 .replace(/([A-Z])/g, ' $1')
//                                                 .toLowerCase()}
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </ContextMenuTrigger>
//                         <ContextMenuContent>
//                             <ContextMenuItem onClick={() => handleReply(message.id)}>
//                                 Reply
//                             </ContextMenuItem>
//                             <ContextMenuItem
//                                 onClick={() => {
//                                     setSelectedMessageId(message.id)
//                                     setIsKanbanDialogOpen(true)
//                                 }}
//                             >
//                                 Add to Kanban
//                             </ContextMenuItem>
//                         </ContextMenuContent>
//                     </ContextMenu>
//                 )

//                 acc.push(messageElement)
//                 return acc
//             },
//             []
//         )
//     }

//     return (
//         <div className="flex h-screen bg-gradient-to-br from-pink-100 to-purple-200">
//             {/* Sidebar */}
//             <div className="w-64 overflow-y-auto bg-white p-4">
//                 <div className="mb-6 flex items-center justify-between">
//                     <h2 className="text-xl font-bold text-purple-600">Channels</h2>
//                     <Button
//                         onClick={addNewChannel}
//                         size="icon"
//                         className="rounded-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600"
//                     >
//                         <Plus className="h-4 w-4" />
//                         <span className="sr-only">Add Channel</span>
//                     </Button>
//                 </div>
//                 {channels.map((channel) => (
//                     <Button
//                         key={channel.id}
//                         onClick={() => setActiveChannel(channel)}
//                         className={`mb-2 w-full justify-start rounded-full ${
//                             channel.id === activeChannel.id
//                                 ? 'bg-gradient-to-r from-pink-400 to-purple-500 text-white'
//                                 : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
//                         }`}
//                     >
//                         {channel.name}
//                     </Button>
//                 ))}
//             </div>

//             {/* Chat Area */}
//             <div className="flex flex-1 flex-col">
//                 {/* Header */}
//                 <header className="bg-white p-4 shadow-md">
//                     <h1 className="flex items-center justify-center text-center text-2xl font-bold text-purple-600">
//                         <Palette className="mr-2 h-6 w-6" />
//                         {activeChannel.name}
//                         <Sparkles className="ml-2 h-6 w-6" />
//                     </h1>
//                 </header>

//                 {/* Messages */}
//                 <div className="flex-1 overflow-y-auto p-4">{renderMessages()}</div>

//                 {/* Input Area */}
//                 <div className="bg-white p-4">
//                     {replyingTo && (
//                         <div className="mb-2 flex items-center rounded-lg bg-gray-100 p-2">
//                             <CornerDownRight className="mr-2 h-4 w-4" />
//                             <span className="text-sm">
//                                 Replying to message {replyingTo}
//                             </span>
//                             <Button
//                                 onClick={cancelReply}
//                                 variant="ghost"
//                                 size="sm"
//                                 className="ml-auto"
//                             >
//                                 <X className="h-4 w-4" />
//                             </Button>
//                         </div>
//                     )}
//                     <form onSubmit={handleSend} className="flex gap-2">
//                         <Avatar className="h-10 w-10">
//                             <AvatarImage
//                                 src="/placeholder.svg?height=40&width=40"
//                                 alt="Client"
//                             />
//                             <AvatarFallback>CL</AvatarFallback>
//                         </Avatar>
//                         <Input
//                             type="text"
//                             placeholder="Type your message..."
//                             value={input}
//                             onChange={(e) => setInput(e.target.value)}
//                             className="flex-grow rounded-full"
//                         />
//                         <input
//                             type="file"
//                             accept="image/*"
//                             onChange={handleImageSelect}
//                             ref={fileInputRef}
//                             className="hidden"
//                         />
//                         <Button
//                             type="button"
//                             size="icon"
//                             className="rounded-full bg-gray-200 hover:bg-gray-300"
//                             onClick={() => fileInputRef.current?.click()}
//                         >
//                             <ImageIcon className="h-4 w-4" />
//                             <span className="sr-only">Attach Image</span>
//                         </Button>
//                         {selectedImage && (
//                             <Button
//                                 type="button"
//                                 size="icon"
//                                 className="rounded-full bg-red-400 hover:bg-red-500"
//                                 onClick={() => setSelectedImage(null)}
//                             >
//                                 <X className="h-4 w-4" />
//                                 <span className="sr-only">Remove Image</span>
//                             </Button>
//                         )}
//                         <Button
//                             type="submit"
//                             size="icon"
//                             className="rounded-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600"
//                         >
//                             <Send className="h-4 w-4" />
//                             <span className="sr-only">Send</span>
//                         </Button>
//                     </form>
//                 </div>
//             </div>

//             {/* Kanban Dialog */}
//             <Dialog open={isKanbanDialogOpen} onOpenChange={setIsKanbanDialogOpen}>
//                 <DialogContent>
//                     <DialogHeader>
//                         <DialogTitle>Add to Kanban Board</DialogTitle>
//                     </DialogHeader>
//                     <RadioGroup
//                         value={selectedKanbanStatus}
//                         onValueChange={(value: 'todo' | 'inProgress' | 'done') =>
//                             setSelectedKanbanStatus(value)
//                         }
//                         className="grid gap-2"
//                     >
//                         <div className="flex items-center space-x-2">
//                             <RadioGroupItem value="todo" id="todo" />
//                             <Label htmlFor="todo">To Do</Label>
//                         </div>
//                         <div className="flex items-center space-x-2">
//                             <RadioGroupItem value="inProgress" id="inProgress" />
//                             <Label htmlFor="inProgress">In Progress</Label>
//                         </div>
//                         <div className="flex items-center space-x-2">
//                             <RadioGroupItem value="done" id="done" />
//                             <Label htmlFor="done">Done</Label>
//                         </div>
//                     </RadioGroup>
//                     <DialogFooter>
//                         <Button onClick={updateMessageKanbanStatus}>Confirm</Button>
//                     </DialogFooter>
//                 </DialogContent>
//             </Dialog>
//         </div>
//     )
// }

// import { useUser } from '@clerk/nextjs'
// import SendbirdProvider from '@sendbird/uikit-react/SendbirdProvider'

// import Channel from '~/components/messages/channel'
// import ChannelList from '~/components/messages/channel-list'

// import { MessagesProvider } from '~/components/messages/messages-context'
// import Loading from '~/components/ui/loading'

// export default function MessagesClient(props: {
//     hide_channel_list?: boolean
//     channel_url?: string
// }) {
//     const session = useUser()

//     if (!session.isLoaded || !session.user) {
//         return <Loading />
//     }

//     return (
//         <div className="flex h-full max-h-[40rem] w-full flex-row overflow-hidden rounded-xl bg-base-300 shadow-xl">
//             <SendbirdProvider
//                 appId="AE781B27-397F-4722-9EC3-13E39266C944"
//                 userId={session.user.id}
//                 theme="dark"
//                 uikitOptions={{
//                     groupChannel: {
//                         enableVoiceMessage: false
//                     }
//                 }}
//             >
//                 <MessagesProvider channel_url={props.channel_url} session={session}>
//                     <ChannelList hide_channel_list={props.hide_channel_list} />
//                     <Channel />
//                 </MessagesProvider>
//             </SendbirdProvider>
//         </div>
//     )
// }
