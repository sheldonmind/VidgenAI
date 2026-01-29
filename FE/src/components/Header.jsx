import { Menu } from 'lucide-react'
import ModelSelector from './ModelSelector'

const Header = ({ isSidebarOpen, onToggleSidebar, selectedModel, onModelChange }) => {
  return (
    <header className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">🤗</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">HuggingChat</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ModelSelector 
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
      </div>
    </header>
  )
}

export default Header
