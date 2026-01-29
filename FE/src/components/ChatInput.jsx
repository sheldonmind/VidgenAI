import { useState } from 'react'
import { Send, Paperclip, Mic } from 'lucide-react'

const ChatInput = ({ onSendMessage }) => {
  const [input, setInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim()) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border-2 border-gray-200 focus-within:border-orange-400 transition-colors p-2">
            <button
              type="button"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
              aria-label="Attach file"
            >
              <Paperclip className="w-5 h-5 text-gray-500" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none py-2 px-2 text-gray-900 placeholder-gray-500 max-h-40"
              style={{
                minHeight: '24px',
                height: 'auto',
              }}
              onInput={(e) => {
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
            />
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                aria-label="Voice input"
              >
                <Mic className="w-5 h-5 text-gray-500" />
              </button>
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>
        <p className="text-xs text-gray-500 text-center mt-3">
          AI can make mistakes. Check important information.
        </p>
      </div>
    </div>
  )
}

export default ChatInput
