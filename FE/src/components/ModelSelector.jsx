import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Sparkles, Zap, Brain, Bot } from 'lucide-react'

const models = [
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'Most capable Llama model with advanced reasoning',
    icon: Brain,
    featured: true
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    description: 'Latest GPT-4 with improved performance',
    icon: Sparkles,
    featured: true
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: 'Balanced performance and intelligence',
    icon: Bot,
    featured: true
  },
  {
    id: 'mixtral-8x7b',
    name: 'Mixtral 8x7B',
    provider: 'Mistral AI',
    description: 'Efficient mixture of experts model',
    icon: Zap,
    featured: false
  },
  {
    id: 'gemini-pro',
    name: 'Gemini Pro',
    provider: 'Google',
    description: 'Multimodal AI with strong reasoning',
    icon: Sparkles,
    featured: false
  },
  {
    id: 'llama-2-70b',
    name: 'Llama 2 70B',
    provider: 'Meta',
    description: 'Previous generation Llama model',
    icon: Brain,
    featured: false
  }
]

const ModelSelector = ({ selectedModel = models[0].id, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const currentModel = models.find(m => m.id === selectedModel) || models[0]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleModelSelect = (modelId) => {
    if (onModelChange) {
      onModelChange(modelId)
    }
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2 border border-gray-200"
      >
        <span>Model: {currentModel.name}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Select a Model</h3>
            <p className="text-xs text-gray-500 mt-1">Choose the AI model for your conversation</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* Featured Models */}
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Featured Models
              </div>
              {models.filter(m => m.featured).map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={model.id === selectedModel}
                  onSelect={handleModelSelect}
                />
              ))}
            </div>

            {/* Other Models */}
            <div className="p-2 border-t border-gray-200">
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Other Models
              </div>
              {models.filter(m => !m.featured).map((model) => (
                <ModelOption
                  key={model.id}
                  model={model}
                  isSelected={model.id === selectedModel}
                  onSelect={handleModelSelect}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ModelOption = ({ model, isSelected, onSelect }) => {
  const Icon = model.icon

  return (
    <button
      onClick={() => onSelect(model.id)}
      className={`w-full px-3 py-2 rounded-lg transition-colors text-left flex items-start gap-3 group ${
        isSelected
          ? 'bg-blue-50 hover:bg-blue-100'
          : 'hover:bg-gray-50'
      }`}
    >
      <div className={`mt-0.5 p-1.5 rounded-md ${
        isSelected 
          ? 'bg-blue-100 text-blue-600' 
          : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-medium ${
            isSelected ? 'text-blue-900' : 'text-gray-900'
          }`}>
            {model.name}
          </span>
          {isSelected && (
            <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{model.provider}</p>
        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{model.description}</p>
      </div>
    </button>
  )
}

export default ModelSelector
