import { useState } from 'react'
import MessageList from './MessageList'
import ChatInput from './ChatInput'

const ChatArea = ({ currentChat }) => {
  const [messages, setMessages] = useState([])
  const [isTyping, setIsTyping] = useState(false)

  const handleSendMessage = async (content) => {
    // Add user message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    setMessages([...messages, userMessage])

    // Simulate AI response
    setIsTyping(true)
    setTimeout(() => {
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'This is a simulated AI response. In a real application, this would be connected to an AI model API like those available on Hugging Face.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMessage])
      setIsTyping(false)
    }, 1500)
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-2xl px-4">
            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl">🤗</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome to HuggingChat
            </h2>
            <p className="text-gray-600 mb-8">
              Ask me anything! I'm here to help with coding, writing, analysis, and more.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={() => handleSendMessage('Explain quantum computing in simple terms')}
                className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
              >
                <div className="text-sm font-medium text-gray-900 mb-1">
                  📚 Explain a concept
                </div>
                <div className="text-xs text-gray-600">
                  Quantum computing in simple terms
                </div>
              </button>
              <button
                onClick={() => handleSendMessage('Write a Python function to sort a list')}
                className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
              >
                <div className="text-sm font-medium text-gray-900 mb-1">
                  💻 Write code
                </div>
                <div className="text-xs text-gray-600">
                  Python function to sort a list
                </div>
              </button>
              <button
                onClick={() => handleSendMessage('Brainstorm ideas for a mobile app')}
                className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
              >
                <div className="text-sm font-medium text-gray-900 mb-1">
                  💡 Brainstorm ideas
                </div>
                <div className="text-xs text-gray-600">
                  Creative mobile app concepts
                </div>
              </button>
              <button
                onClick={() => handleSendMessage('Help me debug this error')}
                className="p-4 border-2 border-gray-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all text-left"
              >
                <div className="text-sm font-medium text-gray-900 mb-1">
                  🔧 Debug code
                </div>
                <div className="text-xs text-gray-600">
                  Get help with errors
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isTyping={isTyping} />
      )}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  )
}

export default ChatArea
