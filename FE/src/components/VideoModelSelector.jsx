import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Zap, Sparkles } from 'lucide-react'

const VideoModelSelector = ({ models, selectedModel, onModelChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const currentModel = models?.find(m => m.id === selectedModel?.id || m.id === selectedModel) || models?.[0]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Don't render if no models available
  if (!models || models.length === 0 || !currentModel) {
    return (
      <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-center">
        <div className="text-neutral-400 text-sm">No models available</div>
      </div>
    )
  }

  const handleModelSelect = (model) => {
    if (onModelChange) {
      onModelChange(model)
    }
    setIsOpen(false)
  }

  const getCategoryColor = (category) => {
    switch (category) {
      case 'GENERAL':
        return 'bg-lime-400/20 text-lime-400'
      case 'MOTION':
        return 'bg-pink-500/20 text-pink-400'
      case 'ADVANCED':
        return 'bg-purple-500/20 text-purple-400'
      default:
        return 'bg-neutral-700 text-neutral-300'
    }
  }

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'ADVANCED':
        return <Sparkles className="w-4 h-4" />
      case 'MOTION':
        return <Zap className="w-4 h-4" />
      default:
        return <Zap className="w-4 h-4" />
    }
  }

  // Group models by category
  const groupedModels = (models || []).reduce((acc, model) => {
    const category = model.category || 'GENERAL'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(model)
    return acc
  }, {})

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 hover:border-neutral-600 transition-colors flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getCategoryColor(currentModel.category)}`}>
            {getCategoryIcon(currentModel.category)}
          </div>
          <div className="text-left">
            <div className="text-white text-sm font-medium">{currentModel.name}</div>
            <div className={`text-xs font-bold ${currentModel.category === 'GENERAL' ? 'text-lime-400' : currentModel.category === 'ADVANCED' ? 'text-purple-400' : 'text-pink-400'}`}>
              {currentModel.category}
            </div>
          </div>
        </div>
        <ChevronDown 
          className={`w-5 h-5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-neutral-900 rounded-xl shadow-2xl border border-neutral-800 z-50 overflow-hidden">
          <div className="p-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
            <h3 className="text-sm font-semibold text-white">Select Model</h3>
            <p className="text-xs text-neutral-400 mt-1">Choose the AI model for video generation</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {Object.entries(groupedModels).map(([category, categoryModels]) => (
              <div key={category} className="p-2">
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider" 
                     style={{ 
                       color: category === 'GENERAL' ? '#bef264' : 
                              category === 'ADVANCED' ? '#c084fc' : 
                              category === 'MOTION' ? '#f472b6' : '#a3a3a3'
                     }}>
                  {category}
                </div>
                {categoryModels.map((model) => (
                  <ModelOption
                    key={model.id}
                    model={model}
                    isSelected={model.id === currentModel.id}
                    onSelect={handleModelSelect}
                    getCategoryColor={getCategoryColor}
                    getCategoryIcon={getCategoryIcon}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const ModelOption = ({ model, isSelected, onSelect, getCategoryColor, getCategoryIcon }) => {
  return (
    <button
      onClick={() => onSelect(model)}
      className={`w-full px-3 py-3 rounded-lg transition-all text-left flex items-center gap-3 group ${
        isSelected
          ? 'bg-lime-400/10 border border-lime-400/30'
          : 'hover:bg-neutral-800/50 border border-transparent'
      }`}
    >
      <div className={`p-2 rounded-lg ${getCategoryColor(model.category)}`}>
        {getCategoryIcon(model.category)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-medium ${
            isSelected ? 'text-lime-400' : 'text-white'
          }`}>
            {model.name}
          </span>
          {isSelected && (
            <Check className="w-4 h-4 text-lime-400 flex-shrink-0" />
          )}
        </div>
      </div>
    </button>
  )
}

export default VideoModelSelector
