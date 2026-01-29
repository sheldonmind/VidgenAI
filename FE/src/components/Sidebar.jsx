import { Plus, MessageSquare, Settings, User, X } from 'lucide-react'

const Sidebar = ({ isOpen, conversations, currentChat, onSelectChat, onNewChat }) => {
  if (!isOpen) return null

  return (
    <aside className="w-80 border-r border-gray-200 bg-white flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewChat}
          className="w-full px-4 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Chat
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500 px-3 py-2 uppercase tracking-wide">
            Today
          </div>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectChat(conv.id)}
              className={`w-full px-3 py-2.5 rounded-lg text-left transition-all flex items-center gap-3 group ${
                currentChat === conv.id
                  ? 'bg-gray-100 text-gray-900'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-500" />
              <span className="flex-1 truncate text-sm">{conv.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-gray-200 p-3 space-y-1">
        <button className="w-full px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 text-gray-700 transition-all flex items-center gap-3">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-sm">Settings</span>
        </button>
        <button className="w-full px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 text-gray-700 transition-all flex items-center gap-3">
          <User className="w-4 h-4 text-gray-500" />
          <span className="text-sm">Profile</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
