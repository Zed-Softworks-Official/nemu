import NemuImage from '../nemu-image'
import ChatBubble from './chat-buble'
import MessagesCard from './messages-card'

export default function MessagesClient() {
    return (
        <div className="bg-fullblack rounded-xl w-full">
            <div className="grid grid-cols-6 gap-4 h-[30rem]">
                <div className="col-span-2">
                    <div className="flex flex-col gap-4">
                        <MessagesCard username={'JackSchitt404'} selected />
                        <MessagesCard username={'ChibiMiharu'} />
                    </div>
                </div>
                <div className="col-span-4 bg-base-100 rounded-xl p-5 h-full relative">
                    <ChatBubble
                        username="JackSchitt404"
                        profile_photo="/profile.png"
                        timestamp="12:45"
                        message="WHY ARE WE YELLING!"
                        status="Delivered"
                    />
                   <ChatBubble
                        username="GnarlyTiger"
                        profile_photo="/profile.png"
                        timestamp="12:46"
                        message="WHY ARE WE YELLING!"
                        status="Seen at 12:46"
                    />

                    <div className="w-full absolute bottom-0 left-0 join rounded-t-none">
                        <input
                            type="text"
                            placeholder="Type here"
                            className="input bg-base-300 w-full join-item"
                        />
                        <button type="button" className="btn btn-primary join-item">
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
