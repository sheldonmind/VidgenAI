import React, { useState, useEffect, useRef } from 'react';
import { Play, Image, Video, Zap, History, Info, ChevronRight, Upload, Trash2, Settings } from 'lucide-react';
import VideoModelSelector from './VideoModelSelector';
import TikTokSettings from './TikTokSettings';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
const FALLBACK_THUMBNAIL = 'https://placehold.co/600x400?text=Generating';

const mapGeneration = (generation) => {
  // Use proxy endpoints for Google API URLs, or original URLs for local files
  const needsProxy = generation.videoUrl?.includes('generativelanguage.googleapis.com');
  const needsThumbnailProxy = generation.thumbnailUrl?.includes('generativelanguage.googleapis.com');
  
  return {
    id: generation.id,
    prompt: generation.prompt || '',
    model: generation.modelName || 'Unknown Model',
    duration: generation.duration,
    aspectRatio: generation.aspectRatio,
    resolution: generation.resolution,
    status: generation.status,
    feature: generation.feature,
    errorCode: generation.errorCode,
    errorMessage: generation.errorMessage,
    createdAt: new Date(generation.createdAt),
    thumbnail: needsThumbnailProxy 
      ? `${API_BASE_URL}/generations/${generation.id}/thumbnail`
      : (generation.thumbnailUrl || generation.imageUrl || generation.inputImageUrl || FALLBACK_THUMBNAIL),
    videoUrl: needsProxy 
      ? `${API_BASE_URL}/generations/${generation.id}/video`
      : (generation.videoUrl || generation.imageUrl || generation.thumbnailUrl || generation.inputImageUrl || FALLBACK_THUMBNAIL),
    imageUrl: generation.imageUrl,
    inputImageUrl: generation.inputImageUrl,
    inputVideoUrl: generation.inputVideoUrl,
    characterImageUrl: generation.characterImageUrl
  };
};

const INITIAL_GENERATIONS = [];

// Feature label colors and names
const FEATURE_LABELS = {
  'text-to-video': { name: 'Text to Video', color: 'bg-blue-500' },
  'image-to-video': { name: 'Image to Video', color: 'bg-purple-500' },
  'create': { name: 'Create Video', color: 'bg-purple-500' },
  'edit': { name: 'Edit Video', color: 'bg-orange-500' },
  'motion': { name: 'Motion Control', color: 'bg-pink-500' },
  'video-to-video': { name: 'Video to Video', color: 'bg-green-500' },
};

const VideoGenerator = () => {
  const [activeTab, setActiveTab] = useState('text-to-video');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('6s');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('720p');
  const [autoSettings, setAutoSettings] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [generations, setGenerations] = useState(INITIAL_GENERATIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [motionControlEnabled, setMotionControlEnabled] = useState(false);
  const [uploadedVideoFile, setUploadedVideoFile] = useState(null);
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [uploadedCharacterFile, setUploadedCharacterFile] = useState(null);
  const [startFrameFile, setStartFrameFile] = useState(null);
  const [endFrameFile, setEndFrameFile] = useState(null);
  // Mode selection when no image: 'text-to-image' or 'text-to-video'
  const [textMode, setTextMode] = useState('text-to-video');
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);
  const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, videoId: null });
  const [historyVideoModal, setHistoryVideoModal] = useState({ show: false, video: null });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showTikTokSettings, setShowTikTokSettings] = useState(false);
  const [tiktokUploadModal, setTiktokUploadModal] = useState({ show: false, video: null });
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [isUploadingToTiktok, setIsUploadingToTiktok] = useState(false);
  
  // Timer states
  const [generationTimer, setGenerationTimer] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef(null);

  // Get current model capabilities
  const currentCapabilities = selectedModel?.capabilities || {
    durations: ['6s'],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    supportsAudio: true,
    defaultDuration: '6s',
    defaultAspectRatio: '16:9',
    defaultResolution: '720p'
  };

  // Get estimated time based on feature and inputs
  const getEstimatedTime = (featureType) => {
    const estimates = {
      'text-to-video': { min: 30, max: 60 },
      'create': { min: 45, max: 90 },
      'edit': { min: 60, max: 120 },
      'motion': { min: 90, max: 180 },
      'video-to-video': { min: 60, max: 120 }
    };
    return estimates[featureType] || { min: 30, max: 60 };
  };

  // Format time display (seconds to MM:SS)
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Detect generation type based on prompt and uploads
  const detectGenerationType = () => {
    if (motionControlEnabled) return 'motion-control';
    if (uploadedVideoFile) return 'video-to-video';
    if (activeTab === 'text-to-image') {
      // In text-to-image tab: if image uploaded, switch to image-to-image
      if (uploadedImageFile) return 'image-to-image';
      return 'text-to-image';
    }
    if (activeTab === 'image-to-image' && uploadedImageFile) return 'image-to-image';
    // In text-to-video tab: handle different modes
    if (activeTab === 'text-to-video') {
      // When in text-to-image mode: if start/end frame uploaded, use image-to-image
      if (textMode === 'text-to-image' && (startFrameFile || endFrameFile)) {
        return 'image-to-image';
      }
      // When in text-to-video mode (or default): if image uploaded, switch to image-to-video
      if ((textMode === 'text-to-video' || !textMode) && uploadedImageFile) {
        return 'image-to-video';
      }
      return textMode || 'text-to-video';
    }
    if (uploadedImageFile && activeTab === 'create') return 'image-to-video';
    return 'text-to-video';
  };

  // Determine current mode for badge display
  const getCurrentMode = () => {
    if (activeTab === 'text-to-image') {
      // In text-to-image tab: if image uploaded, switch to image-to-image
      if (uploadedImageFile) {
        return { type: 'image-to-image', badge: 'Image to Image', color: 'bg-teal-500', description: 'Transform image with AI' };
      }
      return { type: 'text-to-image', badge: 'Text to Image', color: 'bg-indigo-500', description: 'Generate image from text description' };
    }
    if (activeTab === 'image-to-image') {
      return { type: 'image-to-image', badge: 'Image to Image', color: 'bg-teal-500', description: 'Transform image with AI' };
    }
    if (motionControlEnabled) {
      return { type: 'motion', badge: 'Motion Control', color: 'bg-pink-500', description: 'Transfer motion from reference video' };
    }
    if (uploadedVideoFile && uploadedImageFile) {
      return { type: 'edit', badge: 'Edit Video', color: 'bg-orange-500', description: 'Transform video with AI' };
    }
    if (uploadedVideoFile) {
      return { type: 'video-to-video', badge: 'Video to Video', color: 'bg-green-500', description: 'Transform existing video with AI' };
    }
    // In text-to-video tab: handle different modes
    if (activeTab === 'text-to-video') {
      // When in text-to-image mode: if start/end frame uploaded, switch to image-to-image
      if (textMode === 'text-to-image' && (startFrameFile || endFrameFile)) {
        return { type: 'image-to-image', badge: 'Image to Image', color: 'bg-teal-500', description: 'Transform image with AI' };
      }
      if (textMode === 'text-to-image') {
        return { type: 'text-to-image', badge: 'Text to Image', color: 'bg-indigo-500', description: 'Generate image from text description' };
      }
      // When in text-to-video mode (or default): if image uploaded, switch to image-to-video
      if ((textMode === 'text-to-video' || !textMode) && uploadedImageFile) {
        return { type: 'image-to-video', badge: 'Image to Video', color: 'bg-purple-500', description: 'Animate your image into video' };
      }
    }
    if (uploadedImageFile && activeTab === 'create') {
      return { type: 'create', badge: 'Create Video', color: 'bg-purple-500', description: 'Animate your image into video' };
    }
    return { type: 'text-to-video', badge: 'Text to Video', color: 'bg-blue-500', description: 'Generate video from text description' };
  };

  const currentMode = getCurrentMode();

  // Group videos by date
  const groupVideosByDate = (videos) => {
    const groups = {};
    videos.forEach(video => {
      const dateKey = video.createdAt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(video);
    });
    return groups;
  };

  // Load models from API
  useEffect(() => {
    let isActive = true;

    const loadModels = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/models`);
        if (!response.ok) {
          throw new Error(`Failed to load models (${response.status})`);
        }
        const payload = await response.json();
        if (!isActive) return;
        const loadedModels = payload.data || [];
        setModels(loadedModels);
        if (loadedModels.length > 0 && !selectedModel) {
          setSelectedModel(loadedModels[0]);
        }
      } catch (error) {
        console.error('❌ Failed to load models:', error);
      }
    };

    loadModels();
    return () => {
      isActive = false;
    };
  }, []);

  // Update settings when model changes
  useEffect(() => {
    if (selectedModel?.capabilities) {
      const caps = selectedModel.capabilities;
      
      // Update duration if current one is not supported
      if (!caps.durations.includes(duration)) {
        setDuration(caps.defaultDuration);
      }
      
      // Update aspect ratio if current one is not supported
      if (!caps.aspectRatios.includes(aspectRatio)) {
        setAspectRatio(caps.defaultAspectRatio);
      }
      
      // Update resolution if current one is not supported
      if (!caps.resolutions.includes(resolution)) {
        setResolution(caps.defaultResolution);
      }
      
      // Disable audio if model doesn't support it
      if (!caps.supportsAudio && audioEnabled) {
        setAudioEnabled(false);
      }
    }
  }, [selectedModel]);


  // Load generations from API
  useEffect(() => {
    let isActive = true;

    const loadGenerations = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/generations?limit=50`);
        if (!response.ok) {
          throw new Error(`Failed to load generations (${response.status})`);
        }
        const payload = await response.json();
        if (!isActive) return;
        const mapped = (payload.data || []).map(mapGeneration);
        setGenerations(mapped);
      } catch (error) {
        console.error('❌ Failed to load generations:', error);
      }
    };

    loadGenerations();
    return () => {
      isActive = false;
    };
  }, []);

  // Check TikTok connection status
  useEffect(() => {
    const checkTikTokConnection = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tiktok/status`);
        if (response.ok) {
          const data = await response.json();
          setTiktokConnected(data.connected || false);
        }
      } catch (error) {
        console.error('❌ Failed to check TikTok status:', error);
      }
    };

    checkTikTokConnection();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        setShowDurationDropdown(false);
        setShowRatioDropdown(false);
        setShowResolutionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Timer effect - updates elapsed time every second
  useEffect(() => {
    if (generationTimer) {
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - generationTimer.startTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setElapsedTime(0);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [generationTimer]);

  const handleGenerate = async () => {
    const mode = getCurrentMode();
    const generationType = detectGenerationType();

    if (!selectedModel) {
      console.error('No model selected. Please select a model first.');
      return;
    }

    if (!prompt && (generationType === 'text-to-video' || generationType === 'text-to-image' || generationType === 'image-to-image')) {
      console.warn('Prompt is required for text-to-video/text-to-image/image-to-image generation.');
      return;
    }
    
    if (!uploadedImageFile && generationType === 'image-to-image') {
      console.warn('Image is required for image-to-image generation.');
      return;
    }
    
    if (generationType === 'text-to-image' && textMode === 'text-to-image' && !startFrameFile) {
      console.warn('Start frame is required for text-to-image generation.');
      return;
    }
    
    // Video-to-video works without prompt but it's recommended
    if (!prompt && generationType === 'video-to-video') {
      console.warn('Prompt is recommended for video-to-video generation for better results.');
    }

    setIsGenerating(true);
    
    // Start timer
    const startTime = Date.now();
    setGenerationTimer({
      startTime,
      feature: mode.type,
      generationType,
      inputs: {
        hasPrompt: !!prompt,
        hasVideo: !!uploadedVideoFile,
        hasImage: !!uploadedImageFile,
        hasCharacter: !!uploadedCharacterFile
      }
    });

    try {
      const formData = new FormData();
      if (prompt) formData.append('prompt', prompt);
      formData.append('modelName', selectedModel.name);
      // For image generation, use "0s" as duration (images don't have duration)
      const durationValue = (generationType === 'text-to-image' || generationType === 'image-to-image') ? '0s' : duration;
      formData.append('duration', durationValue);
      formData.append('aspectRatio', aspectRatio || '16:9');
      formData.append('resolution', resolution || '720p');
      formData.append('audioEnabled', String(audioEnabled));
      formData.append('feature', mode.type);
      formData.append('generationType', generationType);
      
      // Log form data for debugging
      console.log('📤 Sending generation request:', {
        modelName: selectedModel.name,
        duration: durationValue,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '720p',
        generationType,
        feature: mode.type
      });

      if (uploadedVideoFile) formData.append('video', uploadedVideoFile);
      if (uploadedImageFile) formData.append('image', uploadedImageFile);
      if (uploadedCharacterFile) formData.append('characterImage', uploadedCharacterFile);
      if (startFrameFile) formData.append('startFrame', startFrameFile);
      if (endFrameFile) formData.append('endFrame', endFrameFile);

      const response = await fetch(`${API_BASE_URL}/generations`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Generation failed (${response.status})`);
      }

      const payload = await response.json();
      const created = mapGeneration(payload.data);

      setGenerations(prev => [created, ...prev]);

      const pollInterval = 5000;
      const maxAttempts = 120;
      let attempts = 0;

      const poll = async () => {
        if (attempts >= maxAttempts) {
          // Stop timer on timeout
          setGenerationTimer(null);
          return;
        }
        attempts += 1;

        try {
          const statusResponse = await fetch(`${API_BASE_URL}/generations/${created.id}`);
          if (!statusResponse.ok) return;
          const statusPayload = await statusResponse.json();
          const updated = mapGeneration(statusPayload.data);

          setGenerations(prev =>
            prev.map(gen => (gen.id === updated.id ? updated : gen))
          );

          if (updated.status === 'in_progress') {
            setTimeout(poll, pollInterval);
          } else {
            // Stop timer when completed or failed
            setGenerationTimer(null);

            // Show TikTok upload notification if video completed successfully and TikTok is connected
            if (updated.status === 'completed' && tiktokConnected) {
              setTiktokUploadModal({ show: true, video: updated });
            }
          }
        } catch (error) {
          setTimeout(poll, pollInterval);
        }
      };

      setTimeout(poll, pollInterval);
    } catch (error) {
      alert(`Failed to create generation: ${error.message || 'Unknown error'}`);
      // Stop timer on error
      setGenerationTimer(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteVideo = async (videoId, event) => {
    if (event) {
      event.stopPropagation();
    }

    setDeleteConfirmation({ show: true, videoId });
  };

  const confirmDelete = async () => {
    const videoId = deleteConfirmation.videoId;
    setDeleteConfirmation({ show: false, videoId: null });

    try {
      const response = await fetch(`${API_BASE_URL}/generations/${videoId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete video (${response.status})`);
      }

      // Remove from local state
      setGenerations(prev => prev.filter(gen => gen.id !== videoId));
    } catch (error) {
      alert('Failed to delete video. Please try again.');
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation({ show: false, videoId: null });
  };

  const handleUploadToTikTok = async (video) => {
    setIsUploadingToTiktok(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/tiktok/post/${video.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: video.prompt || 'AI Generated Video | Created with Kling AI',
          privacyLevel: 'SELF_ONLY'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload to TikTok');
      }
      
      alert('🎉 Video uploaded to TikTok successfully!\n\nCheck your TikTok profile to see it.');
      setTiktokUploadModal({ show: false, video: null });
    } catch (error) {
      alert(`Failed to upload to TikTok: ${error.message}`);
    } finally {
      setIsUploadingToTiktok(false);
    }
  };

  return (
    <>
    <div className="min-h-screen bg-neutral-950 text-white overflow-y-auto">
      {/* Centered Content Container */}
      <div className="max-w-6xl mx-auto py-8 px-6">
        {/* Form Section */}
        <div className="space-y-4 mb-12">
          {activeTab === 'text-to-video' && (
            <>
              {/* Dynamic Mode Banner */}
              <div className={`${currentMode.color} rounded-2xl p-6 mb-6`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {(currentMode.type === 'image-to-image' || currentMode.type === 'text-to-image') ? (
                      <Image size={32} className="text-white" />
                    ) : (
                      <Video size={32} className="text-white" />
                    )}
                    <div>
                      <h2 className="text-white text-2xl font-bold">{currentMode.badge}</h2>
                      <p className="text-white/90 text-sm">{currentMode.description}</p>
                    </div>
                  </div>
                  {/* TikTok Settings Button */}
                  <button
                    onClick={() => setShowTikTokSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-colors"
                    title="TikTok Settings"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                    <span className="text-sm font-medium">TikTok</span>
                  </button>
                </div>
              </div>

              {/* Mode Toggle - Only show when no image is uploaded in text-to-video tab */}
              {!uploadedImageFile && !uploadedVideoFile && !motionControlEnabled && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">Generation Mode</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setTextMode('text-to-image');
                          // Clear start/end frames when switching modes
                          setStartFrameFile(null);
                          setEndFrameFile(null);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          textMode === 'text-to-image'
                            ? 'bg-indigo-500 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Text to Image
                      </button>
                      <button
                        onClick={() => {
                          setTextMode('text-to-video');
                          // Clear start/end frames when switching modes
                          setStartFrameFile(null);
                          setEndFrameFile(null);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          textMode === 'text-to-video'
                            ? 'bg-blue-500 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        Text to Video
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Motion Control Toggle - Hide for image generation modes */}
              {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                <div className="flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">Motion Control</span>
                    <Info size={14} className="text-neutral-500" />
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={motionControlEnabled}
                      onChange={(e) => {
                        const isEnabled = e.target.checked;
                        setMotionControlEnabled(isEnabled);
                      }}
                    />
                    <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-400"></div>
                  </label>
                </div>
              )}

              {/* Video Input - Hide for text-to-image and image-to-image modes */}
              {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Video size={16} className="text-neutral-400" />
                      <span className="text-sm text-white">Video Input</span>
                      <span className="text-xs text-neutral-500">
                        {motionControlEnabled ? '(Required)' : '(Optional)'}
                      </span>
                    </div>
                    {uploadedVideoFile && (
                      <button 
                        onClick={() => setUploadedVideoFile(null)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {uploadedVideoFile ? (
                    <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg">
                      <div className="w-16 h-16 bg-neutral-700 rounded flex items-center justify-center">
                        <Video size={20} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white">{uploadedVideoFile.name}</p>
                        <p className="text-xs text-neutral-500">Video uploaded</p>
                      </div>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <input 
                        type="file" 
                        accept="video/*" 
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setUploadedVideoFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors text-center">
                        <Upload size={24} className="text-neutral-500 mx-auto mb-2" />
                        <p className="text-sm text-neutral-400">Click to upload video</p>
                        <p className="text-xs text-neutral-600 mt-1">MP4, MOV, AVI (max 100MB)</p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {/* Start Frame and End Frame Inputs - Show when Text to Image mode is selected */}
              {!motionControlEnabled && textMode === 'text-to-image' && (
                <>
                  {/* Start Frame Input */}
                  <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Image size={16} className="text-neutral-400" />
                        <span className="text-sm text-white">Start frame</span>
                        <span className="text-xs text-neutral-500">(Required)</span>
                      </div>
                      {startFrameFile && (
                        <button 
                          onClick={() => setStartFrameFile(null)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {startFrameFile ? (
                      <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg">
                        <div className="w-16 h-16 bg-neutral-700 rounded overflow-hidden">
                          <img 
                            src={URL.createObjectURL(startFrameFile)} 
                            alt="Start frame" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white">{startFrameFile.name}</p>
                          <p className="text-xs text-neutral-500">Start frame uploaded</p>
                        </div>
                      </div>
                    ) : (
                      <label className="block cursor-pointer">
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setStartFrameFile(e.target.files[0]);
                            }
                          }}
                        />
                        <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors text-center">
                          <Upload size={24} className="text-neutral-500 mx-auto mb-2" />
                          <p className="text-sm text-neutral-400">Click to upload start frame</p>
                          <p className="text-xs text-neutral-600 mt-1">JPG, PNG, WEBP (max 10MB)</p>
                        </div>
                      </label>
                    )}
                  </div>

                  {/* End Frame Input */}
                  <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Image size={16} className="text-neutral-400" />
                        <span className="text-sm text-white">End frame</span>
                        <span className="text-xs text-neutral-500">(Optional)</span>
                      </div>
                      {endFrameFile && (
                        <button 
                          onClick={() => setEndFrameFile(null)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {endFrameFile ? (
                      <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg">
                        <div className="w-16 h-16 bg-neutral-700 rounded overflow-hidden">
                          <img 
                            src={URL.createObjectURL(endFrameFile)} 
                            alt="End frame" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white">{endFrameFile.name}</p>
                          <p className="text-xs text-neutral-500">End frame uploaded</p>
                        </div>
                      </div>
                    ) : (
                      <label className="block cursor-pointer">
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setEndFrameFile(e.target.files[0]);
                            }
                          }}
                        />
                        <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors text-center">
                          <Upload size={24} className="text-neutral-500 mx-auto mb-2" />
                          <p className="text-sm text-neutral-400">Click to upload end frame</p>
                          <p className="text-xs text-neutral-600 mt-1">JPG, PNG, WEBP (max 10MB)</p>
                        </div>
                      </label>
                    )}
                  </div>
                </>
              )}

              {/* Image Input - Show when motion control is disabled and NOT in text-to-image mode */}
              {!motionControlEnabled && textMode !== 'text-to-image' && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Image size={16} className="text-neutral-400" />
                      <span className="text-sm text-white">
                        {currentMode.type === 'image-to-image' ? 'Image Input (Image to Image mode)' : 
                         'Image Input'}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {currentMode.type === 'image-to-image' ? '(Required)' : 
                         uploadedImageFile ? '(Image to Image mode)' : '(Optional)'}
                      </span>
                    </div>
                    {uploadedImageFile && (
                      <button 
                        onClick={() => setUploadedImageFile(null)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {uploadedImageFile ? (
                    <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg">
                      <div className="w-16 h-16 bg-neutral-700 rounded overflow-hidden">
                        <img 
                          src={URL.createObjectURL(uploadedImageFile)} 
                          alt="Uploaded" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white">{uploadedImageFile.name}</p>
                        <p className="text-xs text-neutral-500">Image uploaded</p>
                      </div>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setUploadedImageFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors text-center">
                        <Upload size={24} className="text-neutral-500 mx-auto mb-2" />
                        <p className="text-sm text-neutral-400">Click to upload image</p>
                        <p className="text-xs text-neutral-600 mt-1">JPG, PNG, WEBP (max 10MB)</p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {/* Character Input - Show only when motion control is enabled */}
              {motionControlEnabled && (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Image size={16} className="text-neutral-400" />
                      <span className="text-sm text-white">Character Image</span>
                      <span className="text-xs text-neutral-500">(Required)</span>
                    </div>
                    {uploadedCharacterFile && (
                      <button 
                        onClick={() => setUploadedCharacterFile(null)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {uploadedCharacterFile ? (
                    <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg">
                      <div className="w-16 h-16 bg-neutral-700 rounded overflow-hidden">
                        <img 
                          src={URL.createObjectURL(uploadedCharacterFile)} 
                          alt="Character" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-white">{uploadedCharacterFile.name}</p>
                        <p className="text-xs text-neutral-500">Character image uploaded</p>
                      </div>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setUploadedCharacterFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="border-2 border-dashed border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors text-center">
                        <Upload size={24} className="text-neutral-500 mx-auto mb-2" />
                        <p className="text-sm text-neutral-400">Upload character image</p>
                        <p className="text-xs text-neutral-600 mt-1">Image with visible face and body</p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              {/* Prompt */}
              <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-white">Prompt</span>
                  <span className="text-xs text-neutral-500">
                    {motionControlEnabled ? '(Optional)' : '(Required)'}
                  </span>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={motionControlEnabled ? "Optional: Describe additional details..." : "Enter a prompt..."}
                  className="w-full bg-transparent text-base text-white resize-none focus:outline-none placeholder:text-neutral-500"
                  rows="4"
                />
              </div>

              {/* Settings Controls Row */}
              <div className={`grid gap-3 ${(currentMode.type === 'text-to-image' || currentMode.type === 'image-to-image') ? 'grid-cols-2' : 'grid-cols-2'}`}>
                      {/* Duration - Hide for image generation modes */}
                      {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                        <div className="relative dropdown-container">
                          <button 
                            onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                            className="w-full flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 hover:border-neutral-600 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-400">⏱</span>
                              <span className="text-white text-sm">Duration: {duration}</span>
                            </div>
                            <ChevronRight size={16} className={`text-neutral-500 transition-transform ${showDurationDropdown ? '-rotate-90' : 'rotate-90'}`} />
                          </button>
                          {showDurationDropdown && (
                            <div className="absolute top-full mt-2 w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden z-50 shadow-xl">
                              {currentCapabilities.durations.map((dur) => (
                                <button
                                  key={dur}
                                  onClick={() => {
                                    setDuration(dur);
                                    setShowDurationDropdown(false);
                                  }}
                                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                    duration === dur ? 'bg-lime-400 text-black' : 'text-white hover:bg-neutral-800'
                                  }`}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Aspect Ratio */}
                      <div className="relative dropdown-container">
                        <button 
                          onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                          className="w-full flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 hover:border-neutral-600 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-400">📐</span>
                            <span className="text-white text-sm">Ratio: {aspectRatio}</span>
                          </div>
                          <ChevronRight size={16} className={`text-neutral-500 transition-transform ${showRatioDropdown ? '-rotate-90' : 'rotate-90'}`} />
                        </button>
                        {showRatioDropdown && (
                          <div className="absolute top-full mt-2 w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden z-50 max-h-60 overflow-y-auto shadow-xl">
                            {currentCapabilities.aspectRatios.map((ratio) => (
                              <button
                                key={ratio}
                                onClick={() => {
                                  setAspectRatio(ratio);
                                  setShowRatioDropdown(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                  aspectRatio === ratio ? 'bg-lime-400 text-black' : 'text-white hover:bg-neutral-800'
                                }`}
                              >
                                {ratio}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Resolution */}
                      <div className="relative dropdown-container">
                        <button 
                          onClick={() => setShowResolutionDropdown(!showResolutionDropdown)}
                          className="w-full flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 hover:border-neutral-600 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-400">📺</span>
                            <span className="text-white text-sm">Resolution: {resolution}</span>
                          </div>
                          <ChevronRight size={16} className={`text-neutral-500 transition-transform ${showResolutionDropdown ? '-rotate-90' : 'rotate-90'}`} />
                        </button>
                        {showResolutionDropdown && (
                          <div className="absolute top-full mt-2 w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden z-50 shadow-xl">
                            {currentCapabilities.resolutions.map((res) => (
                              <button
                                key={res}
                                onClick={() => {
                                  setResolution(res);
                                  setShowResolutionDropdown(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                  resolution === res ? 'bg-lime-400 text-black' : 'text-white hover:bg-neutral-800'
                                }`}
                              >
                                {res}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Audio Toggle - Hide for image generation modes */}
                      {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                        <div className={`flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-xl px-4 py-3 ${!currentCapabilities.supportsAudio ? 'opacity-50' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-neutral-400">🎵</span>
                            <span className="text-white text-sm">Audio</span>
                            {!currentCapabilities.supportsAudio && (
                              <span className="text-xs text-neutral-500">(Not supported)</span>
                            )}
                          </div>
                          <label className={`relative inline-flex items-center ${currentCapabilities.supportsAudio ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                            <input 
                              type="checkbox" 
                              className="sr-only peer"
                              checked={audioEnabled && currentCapabilities.supportsAudio}
                              onChange={(e) => setAudioEnabled(e.target.checked)}
                              disabled={!currentCapabilities.supportsAudio}
                            />
                            <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-400"></div>
                          </label>
                        </div>
                      )}
                    </div>

              {/* Model Selector at the bottom */}
              <VideoModelSelector 
                models={models}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />

              {/* Model Capabilities Info */}
              {selectedModel && (
                  <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Info size={16} className="text-lime-400" />
                      <span className="text-sm font-medium text-white">{selectedModel.name} Capabilities</span>
                    </div>
                    <div className={`grid gap-3 text-xs ${(currentMode.type === 'text-to-image' || currentMode.type === 'image-to-image') ? 'grid-cols-2' : 'grid-cols-2'}`}>
                        {/* Durations - Hide for image generation */}
                        {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                          <div>
                            <span className="text-neutral-500">Durations:</span>
                            <span className="text-white ml-2">{currentCapabilities.durations.join(', ')}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-neutral-500">Aspect Ratios:</span>
                          <span className="text-white ml-2">{currentCapabilities.aspectRatios.join(', ')}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Resolutions:</span>
                          <span className="text-white ml-2">{currentCapabilities.resolutions.join(', ')}</span>
                        </div>
                        {/* Audio - Hide for image generation */}
                        {(currentMode.type !== 'text-to-image' && currentMode.type !== 'image-to-image') && (
                          <div>
                            <span className="text-neutral-500">Audio:</span>
                            <span className={`ml-2 ${currentCapabilities.supportsAudio ? 'text-lime-400' : 'text-red-400'}`}>
                              {currentCapabilities.supportsAudio ? '✓ Supported' : '✗ Not supported'}
                            </span>
                          </div>
                        )}
                        {/* Show supported features for image generation */}
                        {(currentMode.type === 'text-to-image' || currentMode.type === 'image-to-image') && selectedModel.capabilities?.supportedFeatures && (
                          <div>
                            <span className="text-neutral-500">Supported Features:</span>
                            <span className="text-white ml-2">
                              {selectedModel.capabilities.supportedFeatures
                                .filter(f => f === 'text-to-image' || f === 'image-to-image')
                                .join(', ') || 'None'}
                            </span>
                          </div>
                        )}
                      </div>
                  </div>
              )}
            </>
          )}

          {activeTab === 'create' && (
            <>
              {/* Model Preview Banner */}
              <div className="relative rounded-xl overflow-hidden">
                <img src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=200&fit=crop" alt="Model preview" className="w-full h-40 object-cover" />
                <button className="absolute top-3 right-3 bg-neutral-800/80 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5">
                  ✏️ Change
                </button>
                <div className="absolute bottom-3 left-3">
                  <div className="text-white text-sm">Veo</div>
                </div>
              </div>

              {/* Start/End Frame */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600 flex flex-col items-center justify-center min-h-[110px]">
                  <Image size={28} className="text-neutral-500 mb-2" />
                  <p className="text-sm font-medium text-white">Start frame</p>
                  <p className="text-xs text-neutral-400 mt-1">Required</p>
                </div>
                <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600 flex flex-col items-center justify-center min-h-[110px]">
                  <Image size={28} className="text-neutral-500 mb-2" />
                  <p className="text-sm font-medium text-white">End frame</p>
                  <p className="text-xs text-neutral-400 mt-1">Optional</p>
                </div>
              </div>

              {/* Prompt */}
              <div className="bg-neutral-800/50 rounded-xl p-4">
                <label className="block text-sm text-neutral-500 mb-2">Prompt</label>
                <p className="text-sm text-white leading-relaxed">
                  sóng biển dữ dội thật to phía sau trong khi người đàn ông đang ngồi thiền ở một ngôi chùa trên núi tuyết cao phía dưới là tháp chuông
                </p>
              </div>

              {/* Enhance on */}
              <button className="flex items-center gap-2 text-sm text-white">
                <Zap size={16} className="text-neutral-400" />
                <span>Enhance on</span>
              </button>

              {/* Model */}
              <div>
                <label className="block text-xs text-neutral-500 mb-2">Model</label>
                <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                  <span className="text-base font-medium text-white flex items-center gap-2">
                    Veo 3
                    <span className="text-lime-400">⚡</span>
                  </span>
                  <ChevronRight size={18} className="text-neutral-500" />
                </div>
              </div>

              {/* Duration and Resolution */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Duration</label>
                  <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                    <span className="text-base font-medium text-white">6s</span>
                    <ChevronRight size={18} className="text-neutral-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Resolution</label>
                  <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                    <span className="text-base font-medium text-white">720p</span>
                    <ChevronRight size={18} className="text-neutral-500" />
                  </div>
                </div>
              </div>

              {/* Try new banner */}
              <div className="bg-neutral-800/50 border border-lime-500/30 rounded-xl p-3 flex items-center gap-2">
                <span className="text-lime-400 text-lg">📱</span>
                <span className="text-sm text-lime-400">
                  Try new <span className="underline">Veo 3 Start-End Frame</span>
                </span>
              </div>

              {/* Model Selector at the bottom */}
              <VideoModelSelector 
                models={models}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </>
          )}

          {activeTab === 'edit' && (
            <>
              {/* Model Preview Banner */}
              <div className="relative rounded-xl overflow-hidden">
                <img src="https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=200&fit=crop" alt="Model preview" className="w-full h-36 object-cover" />
                <button className="absolute top-3 right-3 bg-neutral-800/80 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5">
                  📖 How it works
                </button>
                <div className="absolute bottom-3 left-3">
                  <div className="text-lime-400 text-lg font-black italic">VEO EDIT</div>
                  <div className="text-white/80 text-xs">Modify, restyle, change angles, transform</div>
                </div>
              </div>

              {/* Upload Reference Video */}
              <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-6 cursor-pointer hover:border-neutral-600">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-neutral-700 rounded-full flex items-center justify-center mb-3">
                    <Video size={20} className="text-neutral-400" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Upload a reference video</p>
                  <p className="text-xs text-neutral-500">Duration required: 3–10 secs</p>
                </div>
              </div>

              {/* Upload Images & Elements */}
              <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-6 cursor-pointer hover:border-neutral-600 relative">
                <div className="absolute top-3 right-3">
                  <span className="bg-neutral-700 text-neutral-400 px-2 py-0.5 rounded text-xs">Optional</span>
                </div>
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-neutral-700 rounded-full flex items-center justify-center mb-3">
                    <span className="text-xl text-neutral-400">+</span>
                  </div>
                  <p className="text-sm font-medium text-white mb-1">Upload images & elements</p>
                  <p className="text-xs text-neutral-500">Up to 4 images or elements</p>
                </div>
              </div>

              {/* Prompt */}
              <div className="bg-neutral-800/50 rounded-xl p-4 min-h-[120px]">
                <label className="block text-sm text-neutral-500 mb-2">Prompt</label>
                <textarea
                  placeholder=""
                  className="w-full bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-neutral-600"
                  rows="4"
                />
              </div>

              {/* Auto Settings */}
              <div className="flex items-center justify-between bg-neutral-800/50 rounded-xl p-4">
                <span className="text-sm text-white">Auto settings</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-400"></div>
                </label>
              </div>

              {/* Duration and Aspect Ratio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Duration</label>
                  <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                    <span className="text-base font-medium text-white">6s</span>
                    <ChevronRight size={18} className="text-neutral-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-2">Aspect Ratio</label>
                  <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                    <span className="text-base font-medium text-white">1:1</span>
                    <ChevronRight size={18} className="text-neutral-500" />
                  </div>
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label className="block text-xs text-neutral-500 mb-2">Resolution</label>
                <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                  <span className="text-base font-medium text-white">720p</span>
                  <ChevronRight size={18} className="text-neutral-500" />
                </div>
              </div>

              {/* Model Selector at the bottom */}
              <VideoModelSelector 
                models={models}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </>
          )}

          {activeTab === 'motion' && (
            <>
              {/* Model Preview Banner */}
              <div className="relative rounded-xl overflow-hidden">
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=200&fit=crop" alt="Model preview" className="w-full h-36 object-cover" />
                <button className="absolute top-3 right-3 bg-neutral-800/80 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5">
                  📖 How it works
                </button>
                <div className="absolute bottom-3 left-3">
                  <div className="text-lime-400 text-lg font-black italic">MOTION CONTROL</div>
                  <div className="text-white/80 text-xs">Control motion with video references</div>
                </div>
              </div>

              {/* Upload Sections Side by Side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600 flex flex-col items-center justify-center min-h-[140px]">
                  <div className="w-10 h-10 bg-neutral-700 rounded-full flex items-center justify-center mb-3">
                    <Video size={20} className="text-neutral-400" />
                  </div>
                  <p className="text-sm font-medium text-white text-center mb-1">Add motion to copy</p>
                  <p className="text-xs text-neutral-500 text-center">Video duration:</p>
                  <p className="text-xs text-neutral-500">3–30 seconds</p>
                </div>
                <div className="bg-neutral-800/30 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600 flex flex-col items-center justify-center min-h-[140px]">
                  <div className="w-10 h-10 bg-neutral-700 rounded-full flex items-center justify-center mb-3">
                    <span className="text-xl text-neutral-400">+</span>
                  </div>
                  <p className="text-sm font-medium text-white text-center mb-1">Add your character</p>
                  <p className="text-xs text-neutral-500 text-center">Image with visible</p>
                  <p className="text-xs text-neutral-500">face and body</p>
                </div>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-xs text-neutral-500 mb-2">Quality</label>
                <div className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 cursor-pointer hover:border-neutral-600">
                  <span className="text-base font-medium text-white">720p</span>
                  <ChevronRight size={18} className="text-neutral-500" />
                </div>
              </div>

              {/* Veo Advanced Features Banner */}
              <div className="bg-neutral-800/50 border border-lime-500/30 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 flex-shrink-0 text-lime-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                  </svg>
                </div>
                <span className="text-sm text-lime-400">Try unlimited <span className="underline">Veo Advanced Features</span></span>
              </div>

              {/* Advanced Settings */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-white">Advanced settings</span>
                <ChevronRight size={18} className="text-neutral-500 rotate-90" />
              </div>

              {/* Model Selector at the bottom */}
              <VideoModelSelector 
                models={models}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
              />
            </>
          )}
        </div>

        {/* Generate Button */}
        <div className="mt-6">
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-lime-400 hover:bg-lime-500 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-lg"
          >
            <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
            {activeTab === 'text-to-video' && (
              <span className="flex items-center gap-1">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/>
                </svg>
                <span>4</span>
              </span>
            )}
          </button>
        </div>

        {/* Generation Timer Display */}
        {generationTimer && (
          <div className="mt-6 bg-gradient-to-r from-lime-900/30 to-lime-800/30 border-2 border-lime-400/50 rounded-2xl p-6 shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-lime-400 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Video size={20} className="text-lime-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Đang tạo video</h3>
                  <span className={`${FEATURE_LABELS[generationTimer.feature]?.color || 'bg-neutral-600'} text-white px-2 py-0.5 rounded text-xs font-medium inline-block mt-1`}>
                    {FEATURE_LABELS[generationTimer.feature]?.name || 'Video'}
                  </span>
                </div>
              </div>
            </div>

            {/* Time Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Elapsed Time */}
              <div className="bg-neutral-900/50 rounded-xl p-4 text-center">
                <div className="text-lime-400 text-2xl font-bold font-mono">
                  {formatTime(elapsedTime)}
                </div>
                <div className="text-neutral-400 text-xs mt-1">Đã trôi qua</div>
              </div>

              {/* Estimated Time */}
              <div className="bg-neutral-900/50 rounded-xl p-4 text-center">
                <div className="text-cyan-400 text-2xl font-bold font-mono">
                  {formatTime(getEstimatedTime(generationTimer.feature).min)}-{formatTime(getEstimatedTime(generationTimer.feature).max)}
                </div>
                <div className="text-neutral-400 text-xs mt-1">Dự kiến</div>
              </div>

              {/* Progress Indicator */}
              <div className="bg-neutral-900/50 rounded-xl p-4 text-center">
                <div className="text-white text-2xl font-bold">
                  {Math.min(Math.floor((elapsedTime / getEstimatedTime(generationTimer.feature).max) * 100), 99)}%
                </div>
                <div className="text-neutral-400 text-xs mt-1">Tiến độ</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full h-3 bg-neutral-900/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-lime-400 to-cyan-400 rounded-full transition-all duration-1000 ease-out relative"
                  style={{ 
                    width: `${Math.min((elapsedTime / getEstimatedTime(generationTimer.feature).max) * 100, 99)}%` 
                  }}
                >
                  <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Input Details */}
            <div className="bg-neutral-900/50 rounded-xl p-4">
              <div className="text-neutral-400 text-xs mb-2 font-semibold">Chi tiết đầu vào:</div>
              <div className="flex flex-wrap gap-2">
                {generationTimer.inputs.hasPrompt && (
                  <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Prompt
                  </span>
                )}
                {generationTimer.inputs.hasVideo && (
                  <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs flex items-center gap-1">
                    <Video size={12} />
                    Video
                  </span>
                )}
                {generationTimer.inputs.hasImage && (
                  <span className="bg-pink-500/20 text-pink-400 px-2 py-1 rounded text-xs flex items-center gap-1">
                    <Image size={12} />
                    Image
                  </span>
                )}
                {generationTimer.inputs.hasCharacter && (
                  <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs flex items-center gap-1">
                    <Image size={12} />
                    Character
                  </span>
                )}
                <span className="bg-neutral-700/50 text-neutral-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                  <span className="text-neutral-400">🎥</span>
                  {selectedModel?.name || 'Unknown Model'}
                </span>
              </div>
            </div>

            {/* Helpful Tip */}
            <div className="mt-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 flex items-start gap-2">
              <Info size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="text-cyan-300 text-xs">
                Thời gian tạo video phụ thuộc vào độ phức tạp của đầu vào và tải hệ thống. 
                {generationTimer.feature === 'motion' && ' Motion control thường mất nhiều thời gian hơn.'}
                {generationTimer.feature === 'text-to-video' && ' Text-to-video thường nhanh nhất.'}
              </p>
            </div>
          </div>
        )}

        {/* Latest Creation Section */}
        {generations.length > 0 && generations[0] && (
          <div className="mt-12">
            <div className="flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-lime-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/>
              </svg>
              <h2 className="text-xl font-bold">Latest Creation</h2>
            </div>
            
            {(() => {
              const latestVideo = generations[0];
              return (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_380px]">
                    {/* Left: Video Preview */}
                    <div className="relative bg-black p-8 flex items-center justify-center">
                      {/* Video Display */}
                      <div className="relative max-w-md w-full">
                        {latestVideo.status === 'in_progress' ? (
                          <div className="aspect-video bg-neutral-900 rounded-lg flex flex-col items-center justify-center">
                            <div className="w-12 h-12 border-4 border-lime-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <div className="bg-lime-400/20 text-lime-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2">
                              <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse"></span>
                              In progress
                            </div>
                            <button 
                              onClick={async () => {
                                try {
                                  const response = await fetch(`${API_BASE_URL}/generations/${latestVideo.id}/check-status`, {
                                    method: 'POST'
                                  });
                                  if (response.ok) {
                                    const payload = await response.json();
                                    const updated = mapGeneration(payload.data);
                                    setGenerations(prev => prev.map(gen => gen.id === updated.id ? updated : gen));
                                    setSelectedGeneration(updated);
                                  }
                                } catch (error) {
                                  console.error('Failed to check status:', error);
                                }
                              }}
                              className="mt-4 text-xs text-neutral-400 hover:text-lime-400 underline"
                            >
                              Check status now
                            </button>
                          </div>
                        ) : latestVideo.status === 'failed' ? (
                          <div className="aspect-video bg-neutral-900 rounded-lg flex flex-col items-center justify-center p-6">
                            <div className="text-red-400 mb-4">
                              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="bg-red-400/20 text-red-400 px-3 py-1 rounded-full text-xs font-semibold mb-2">
                              Generation failed
                            </div>
                            {latestVideo.errorMessage && (
                              <div className="mt-3 text-center">
                                <p className="text-red-400 text-sm font-semibold mb-1">{latestVideo.errorMessage}</p>
                                {latestVideo.errorCode && (
                                  <p className="text-neutral-500 text-xs mb-2">Error code: {latestVideo.errorCode}</p>
                                )}
                                {latestVideo.errorCode === 'QUOTA_EXCEEDED' && (
                                  <p className="text-neutral-400 text-xs mt-2">
                                    Check your{' '}
                                    <a 
                                      href="https://ai.google.dev/gemini-api/docs/rate-limits" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-lime-400 hover:underline"
                                    >
                                      API quota
                                    </a>
                                    {' '}or try again later
                                  </p>
                                )}
                              </div>
                            )}
                            <button 
                              onClick={handleGenerate}
                              className="mt-2 text-xs text-neutral-400 hover:text-lime-400 underline"
                            >
                              Try again
                            </button>
                          </div>
                        ) : (
                          <div className="relative aspect-video bg-neutral-900 rounded-lg overflow-hidden">
                            {(latestVideo.feature === 'text-to-image' || latestVideo.feature === 'image-to-image') ? (
                              <img 
                                src={latestVideo.imageUrl || latestVideo.thumbnail} 
                                alt="Generated image"
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <video 
                                src={latestVideo.videoUrl} 
                                poster={latestVideo.thumbnail}
                                controls
                                preload="none"
                                playsInline
                                className="w-full h-full object-contain"
                              >
                                Your browser does not support the video tag.
                              </video>
                            )}
                          </div>
                        )}
                      </div>
                      
                    </div>

                    {/* Right: Details Panel */}
                    <div className="bg-neutral-900 p-6 flex flex-col">
                      {/* Model Name at Top */}
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/>
                        </svg>
                        <h3 className="text-white font-semibold text-base">{latestVideo.model}</h3>
                      </div>

                      {/* Input Thumbnails - Show based on feature type */}
                      {latestVideo.feature !== 'text-to-video' && (
                        <div className="flex gap-2 mb-4">
                          {/* Create Video: 1 frame (image upload) */}
                          {latestVideo.feature === 'create' && latestVideo.inputImageUrl && (
                            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                              <img 
                                src={latestVideo.inputImageUrl} 
                                alt="Image input" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          
                          {/* Edit Video: 2 frames (image + video) */}
                          {latestVideo.feature === 'edit' && (
                            <>
                              {latestVideo.inputImageUrl && (
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                                  <img 
                                    src={latestVideo.inputImageUrl} 
                                    alt="Image input" 
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              {latestVideo.inputVideoUrl && (
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                                  <video 
                                    src={latestVideo.inputVideoUrl} 
                                    className="w-full h-full object-cover"
                                    muted
                                  />
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* Motion Control: 2 frames (video + character image) */}
                          {latestVideo.feature === 'motion' && (
                            <>
                              {latestVideo.inputVideoUrl && (
                                <div 
                                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 transition-transform duration-300 ease-in-out hover:scale-[2.5] hover:z-10"
                                  onMouseEnter={(e) => {
                                    const video = e.currentTarget.querySelector('video');
                                    if (video) {
                                      video.currentTime = 0;
                                      video.play();
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    const video = e.currentTarget.querySelector('video');
                                    if (video) {
                                      video.pause();
                                      video.currentTime = 0;
                                    }
                                  }}
                                >
                                  <video 
                                    src={latestVideo.inputVideoUrl} 
                                    className="w-full h-full object-cover"
                                    muted
                                    loop
                                  />
                                </div>
                              )}
                              {latestVideo.characterImageUrl && (
                                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 transition-transform duration-300 ease-in-out hover:scale-[2.5] hover:z-10">
                                  <img 
                                    src={latestVideo.characterImageUrl} 
                                    alt="Character input" 
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Resolution and Duration Badges */}
                      <div className="flex items-center gap-3 mb-6">
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className="text-white text-sm font-medium">{latestVideo.resolution}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-neutral-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-white text-sm font-medium">{latestVideo.duration}</span>
                        </div>
                      </div>

                      {/* Spacer to push date and buttons to bottom */}
                      <div className="flex-1"></div>

                      {/* Date at Bottom */}
                      <div className="text-sm text-neutral-500 mb-4">
                        {latestVideo.createdAt.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>

                      {/* Action Button at Bottom Right */}
                      {latestVideo.status === 'completed' && (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={(e) => handleDeleteVideo(latestVideo.id, e)}
                            className="bg-neutral-800 hover:bg-neutral-700 text-white p-2.5 rounded-lg transition-colors"
                            title="Delete video"
                          >
                            <Trash2 size={18} />
                          </button>
                          <button className="bg-cyan-500 hover:bg-cyan-600 text-white p-2.5 rounded-lg transition-colors" title="Download">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {(latestVideo.status === 'in_progress' || latestVideo.status === 'failed') && (
                        <div className="flex justify-end">
                          <button 
                            onClick={(e) => handleDeleteVideo(latestVideo.id, e)}
                            className="bg-red-500 hover:bg-red-600 text-white p-2.5 rounded-lg transition-colors"
                            title="Delete video"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* History Section */}
        <div className="mt-20 pt-8 border-t border-neutral-800">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">History</h2>
            <div className="flex items-center gap-2 bg-neutral-900 rounded-lg p-1">
              <button 
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-lime-400 text-black' 
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Grid
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-lime-400 text-black' 
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                List
              </button>
            </div>
          </div>

          {/* History Content */}
          {generations.length <= 1 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-xl font-semibold mb-2">No history yet</h3>
              <p className="text-neutral-400 text-sm">Previously generated videos will appear here</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupVideosByDate(generations.slice(1))).map(([date, videos]) => (
                <div key={date}>
                  {/* Date Header */}
                  <h3 className="text-lg font-semibold mb-4 text-white">{date}</h3>
                  
                  {/* Grid View */}
                  {viewMode === 'grid' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {videos.map((gen) => (
                        <div
                          key={gen.id}
                          className="group rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-lime-400/50 bg-neutral-900"
                        >
                          <div 
                            className="relative aspect-video bg-neutral-900 cursor-pointer"
                            onClick={() => setHistoryVideoModal({ show: true, video: gen })}
                          >
                            {gen.status === 'in_progress' ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/80">
                                <div className="w-12 h-12 border-4 border-lime-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <div className="bg-lime-400/20 text-lime-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2">
                                  <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse"></span>
                                  In progress
                                </div>
                              </div>
                            ) : gen.status === 'failed' ? (
                              <div 
                                className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900"
                                title={gen.errorMessage || 'Generation failed'}
                              >
                                <div className="text-red-400 mb-2">
                                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="bg-red-400/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-semibold">
                                  Failed
                                </div>
                                {gen.errorCode === 'QUOTA_EXCEEDED' && (
                                  <div className="mt-1 text-xs text-red-400">Quota</div>
                                )}
                              </div>
                            ) : (
                              <>
                                {(gen.feature === 'text-to-image' || gen.feature === 'image-to-image') ? (
                                  <img 
                                    src={gen.imageUrl || gen.thumbnail || FALLBACK_THUMBNAIL} 
                                    alt="Generated image"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <>
                                    <video 
                                      src={gen.videoUrl} 
                                      poster={gen.thumbnail || FALLBACK_THUMBNAIL}
                                      preload="metadata"
                                      playsInline
                                      className="w-full h-full object-contain"
                                    >
                                      Your browser does not support the video tag.
                                    </video>
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                                        <Play size={20} className="text-black ml-1" fill="black" />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                            {/* Feature Badge */}
                            <div className="absolute top-2 left-2">
                              <span className={`${FEATURE_LABELS[gen.feature]?.color || 'bg-neutral-600'} text-white px-2 py-0.5 rounded text-xs font-medium`}>
                                {FEATURE_LABELS[gen.feature]?.name || 'Video'}
                              </span>
                            </div>
                            {/* Status Badge */}
                            {gen.status === 'completed' && (
                              <div className="absolute top-2 right-2">
                                <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-medium">
                                  Done
                                </span>
                              </div>
                            )}
                            {gen.status === 'failed' && (
                              <div className="absolute top-2 right-2">
                                <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-medium">
                                  Failed
                                </span>
                              </div>
                            )}
                            {/* Delete Button */}
                            <button
                              onClick={(e) => handleDeleteVideo(gen.id, e)}
                              className="absolute bottom-2 right-2 bg-red-500/90 hover:bg-red-600 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              title="Delete video"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="bg-neutral-900 p-3">
                            <p className="text-xs text-neutral-400 line-clamp-2 mb-2">{gen.prompt}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-neutral-500">
                                <span>{gen.resolution}</span>
                                <span>•</span>
                                <span>{gen.duration}</span>
                              </div>
                              <span className="text-xs text-neutral-600">
                                {gen.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* List View */}
                  {viewMode === 'list' && (
                    <div className="space-y-3">
                      {videos.map((gen) => (
                        <div
                          key={gen.id}
                          className="group bg-neutral-900 rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-lime-400/50"
                        >
                          <div 
                            className="flex gap-4 p-4 cursor-pointer"
                            onClick={() => setHistoryVideoModal({ show: true, video: gen })}
                          >
                            {/* Thumbnail */}
                            <div className="relative w-48 h-27 flex-shrink-0 bg-neutral-800 rounded-lg overflow-hidden">
                              {gen.status === 'in_progress' ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <div className="w-8 h-8 border-3 border-lime-400 border-t-transparent rounded-full animate-spin mb-2"></div>
                                  <div className="bg-lime-400/20 text-lime-400 px-2 py-0.5 rounded-full text-xs font-semibold">
                                    In progress
                                  </div>
                                </div>
                              ) : gen.status === 'failed' ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <div className="text-red-400 mb-1">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                  <div className="bg-red-400/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-semibold">
                                    Failed
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {(gen.feature === 'text-to-image' || gen.feature === 'image-to-image') ? (
                                    <img 
                                      src={gen.imageUrl || gen.thumbnail || FALLBACK_THUMBNAIL} 
                                      alt="Generated image"
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <>
                                      <video 
                                        src={gen.videoUrl} 
                                        poster={gen.thumbnail || FALLBACK_THUMBNAIL}
                                        preload="metadata"
                                        playsInline
                                        className="w-full h-full object-contain"
                                      >
                                        Your browser does not support the video tag.
                                      </video>
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                        <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                                          <Play size={16} className="text-black ml-1" fill="black" />
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 flex flex-col justify-between min-w-0">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`${FEATURE_LABELS[gen.feature]?.color || 'bg-neutral-600'} text-white px-2 py-0.5 rounded text-xs font-medium`}>
                                    {FEATURE_LABELS[gen.feature]?.name || 'Video'}
                                  </span>
                                  {gen.status === 'completed' && (
                                    <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs font-medium">
                                      Done
                                    </span>
                                  )}
                                  {gen.status === 'failed' && (
                                    <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-medium">
                                      Failed
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-white line-clamp-2 mb-2">{gen.prompt}</p>
                                <div className="flex items-center gap-3 text-xs text-neutral-500">
                                  <span className="flex items-center gap-1">
                                    <span className="text-neutral-400">📺</span>
                                    {gen.resolution}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="text-neutral-400">⏱</span>
                                    {gen.duration}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="text-neutral-400">📐</span>
                                    {gen.aspectRatio}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-neutral-500">{gen.model}</span>
                                <span className="text-xs text-neutral-600">
                                  {gen.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>

                            {/* Delete Button */}
                            <div className="flex items-center">
                              <button
                                onClick={(e) => handleDeleteVideo(gen.id, e)}
                                className="bg-red-500/90 hover:bg-red-600 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete video"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Delete Confirmation Popup */}
      {deleteConfirmation.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={cancelDelete}
          ></div>
          
          {/* Popup */}
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Confirm Delete</h3>
            </div>
            
            <p className="text-neutral-300 text-sm mb-6">
              Are you sure you want to delete this video?
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Video Modal */}
      {historyVideoModal.show && historyVideoModal.video && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setHistoryVideoModal({ show: false, video: null })}
          ></div>
          
          {/* Modal Content */}
          <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl max-w-5xl w-full">
            {/* Close Button */}
            <button
              onClick={() => setHistoryVideoModal({ show: false, video: null })}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-neutral-800/90 hover:bg-neutral-700 rounded-full flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
              {/* Left: Video Preview */}
              <div className="relative bg-black p-8 flex items-center justify-center min-h-[400px]">
                {/* Video Display */}
                <div className="relative max-w-3xl w-full">
                  {historyVideoModal.video.status === 'in_progress' ? (
                    <div className="aspect-video bg-neutral-900 rounded-lg flex flex-col items-center justify-center">
                      <div className="w-12 h-12 border-4 border-lime-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <div className="bg-lime-400/20 text-lime-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2">
                        <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse"></span>
                        In progress
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            const response = await fetch(`${API_BASE_URL}/generations/${historyVideoModal.video.id}/check-status`, {
                              method: 'POST'
                            });
                            if (response.ok) {
                              const payload = await response.json();
                              const updated = mapGeneration(payload.data);
                              setGenerations(prev => prev.map(gen => gen.id === updated.id ? updated : gen));
                              setHistoryVideoModal({ show: true, video: updated });
                            }
                          } catch (error) {
                            console.error('Failed to check status:', error);
                          }
                        }}
                        className="mt-4 text-xs text-neutral-400 hover:text-lime-400 underline"
                      >
                        Check status now
                      </button>
                    </div>
                  ) : historyVideoModal.video.status === 'failed' ? (
                    <div className="aspect-video bg-neutral-900 rounded-lg flex flex-col items-center justify-center p-6">
                      <div className="text-red-400 mb-4">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="bg-red-400/20 text-red-400 px-3 py-1 rounded-full text-xs font-semibold mb-2">
                        Generation failed
                      </div>
                      {historyVideoModal.video.errorMessage && (
                        <div className="mt-3 text-center">
                          <p className="text-red-400 text-sm font-semibold mb-1">{historyVideoModal.video.errorMessage}</p>
                          {historyVideoModal.video.errorCode && (
                            <p className="text-neutral-500 text-xs mb-2">Error code: {historyVideoModal.video.errorCode}</p>
                          )}
                          {historyVideoModal.video.errorCode === 'QUOTA_EXCEEDED' && (
                            <p className="text-neutral-400 text-xs mt-2">
                              Check your{' '}
                              <a 
                                href="https://ai.google.dev/gemini-api/docs/rate-limits" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-lime-400 hover:underline"
                              >
                                API quota
                              </a>
                              {' '}or try again later
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative aspect-video bg-neutral-900 rounded-lg overflow-hidden">
                      <video 
                        src={historyVideoModal.video.videoUrl} 
                        poster={historyVideoModal.video.thumbnail}
                        controls
                        autoPlay
                        preload="auto"
                        playsInline
                        className="w-full h-full object-contain"
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Details Panel */}
              <div className="bg-neutral-900 p-6 flex flex-col">
                {/* Model Name at Top */}
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z"/>
                  </svg>
                  <h3 className="text-white font-semibold text-base">{historyVideoModal.video.model}</h3>
                </div>

                {/* Input Thumbnails - Show based on feature type */}
                {historyVideoModal.video.feature !== 'text-to-video' && (
                  <div className="flex gap-2 mb-4">
                    {/* Create Video: 1 frame (image upload) */}
                    {historyVideoModal.video.feature === 'create' && historyVideoModal.video.inputImageUrl && (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                        <img 
                          src={historyVideoModal.video.inputImageUrl} 
                          alt="Image input" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    {/* Edit Video: 2 frames (image + video) */}
                    {historyVideoModal.video.feature === 'edit' && (
                      <>
                        {historyVideoModal.video.inputImageUrl && (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                            <img 
                              src={historyVideoModal.video.inputImageUrl} 
                              alt="Image input" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        {historyVideoModal.video.inputVideoUrl && (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800">
                            <video 
                              src={historyVideoModal.video.inputVideoUrl} 
                              className="w-full h-full object-cover"
                              muted
                            />
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Motion Control: 2 frames (video + character image) */}
                    {historyVideoModal.video.feature === 'motion' && (
                      <>
                        {historyVideoModal.video.inputVideoUrl && (
                          <div 
                            className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 transition-transform duration-300 ease-in-out hover:scale-[2.5] hover:z-10"
                            onMouseEnter={(e) => {
                              const video = e.currentTarget.querySelector('video');
                              if (video) {
                                video.currentTime = 0;
                                video.play();
                              }
                            }}
                            onMouseLeave={(e) => {
                              const video = e.currentTarget.querySelector('video');
                              if (video) {
                                video.pause();
                                video.currentTime = 0;
                              }
                            }}
                          >
                            <video 
                              src={historyVideoModal.video.inputVideoUrl} 
                              className="w-full h-full object-cover"
                              muted
                              loop
                            />
                          </div>
                        )}
                        {historyVideoModal.video.characterImageUrl && (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 transition-transform duration-300 ease-in-out hover:scale-[2.5] hover:z-10">
                            <img 
                              src={historyVideoModal.video.characterImageUrl} 
                              alt="Character input" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Resolution and Duration Badges */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-1.5 text-neutral-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-white text-sm font-medium">{historyVideoModal.video.resolution}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-white text-sm font-medium">{historyVideoModal.video.duration}</span>
                  </div>
                </div>

                {/* Spacer to push date and buttons to bottom */}
                <div className="flex-1"></div>

                {/* Date at Bottom */}
                <div className="text-sm text-neutral-500 mb-4">
                  {historyVideoModal.video.createdAt.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>

                {/* Action Button at Bottom Right */}
                {historyVideoModal.video.status === 'completed' && (
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={(e) => {
                        handleDeleteVideo(historyVideoModal.video.id, e);
                        setHistoryVideoModal({ show: false, video: null });
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white p-2.5 rounded-lg transition-colors"
                      title="Delete video"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button className="bg-cyan-500 hover:bg-cyan-600 text-white p-2.5 rounded-lg transition-colors" title="Download">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                )}
                {(historyVideoModal.video.status === 'in_progress' || historyVideoModal.video.status === 'failed') && (
                  <div className="flex justify-end">
                    <button 
                      onClick={(e) => {
                        handleDeleteVideo(historyVideoModal.video.id, e);
                        setHistoryVideoModal({ show: false, video: null });
                      }}
                      className="bg-red-500 hover:bg-red-600 text-white p-2.5 rounded-lg transition-colors"
                      title="Delete video"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TikTok Settings Modal */}
      {showTikTokSettings && (
        <TikTokSettings onClose={() => setShowTikTokSettings(false)} />
      )}

      {/* TikTok Upload Notification Modal */}
      {tiktokUploadModal.show && tiktokUploadModal.video && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => !isUploadingToTiktok && setTiktokUploadModal({ show: false, video: null })}
        >
          {/* Modal Content */}
          <div 
            className="bg-neutral-900 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-pink-600 to-purple-600 p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">🎉 Video Complete!</h2>
                  <p className="text-white/80 text-sm">Ready to share on TikTok</p>
                </div>
              </div>
            </div>

            {/* Video Preview */}
            <div className="p-6">
              <div className="bg-black rounded-xl overflow-hidden mb-4">
                <video 
                  src={tiktokUploadModal.video.videoUrl} 
                  poster={tiktokUploadModal.video.thumbnail}
                  controls
                  className="w-full"
                  style={{ maxHeight: '300px' }}
                />
              </div>

              {/* Video Details */}
              <div className="space-y-3 mb-6">
                <div className="bg-neutral-800 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">💬</div>
                    <div className="flex-1">
                      <p className="text-neutral-400 text-xs mb-1">Prompt</p>
                      <p className="text-white text-sm">{tiktokUploadModal.video.prompt}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-neutral-800 p-3 rounded-lg">
                    <p className="text-neutral-400 text-xs mb-1">Model</p>
                    <p className="text-white text-sm font-semibold">{tiktokUploadModal.video.model}</p>
                  </div>
                  <div className="bg-neutral-800 p-3 rounded-lg">
                    <p className="text-neutral-400 text-xs mb-1">Duration</p>
                    <p className="text-white text-sm font-semibold">{tiktokUploadModal.video.duration}</p>
                  </div>
                  <div className="bg-neutral-800 p-3 rounded-lg">
                    <p className="text-neutral-400 text-xs mb-1">Quality</p>
                    <p className="text-white text-sm font-semibold">{tiktokUploadModal.video.resolution}</p>
                  </div>
                </div>
              </div>

              {/* Upload Info */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-blue-400 text-xl">ℹ️</div>
                  <div className="flex-1">
                    <p className="text-blue-400 font-semibold text-sm mb-1">Upload Details</p>
                    <p className="text-neutral-300 text-xs">
                      Video will be uploaded as <span className="font-semibold text-white">Private</span> (only you can see it). 
                      You can change privacy settings on TikTok after upload.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => !isUploadingToTiktok && setTiktokUploadModal({ show: false, video: null })}
                  disabled={isUploadingToTiktok}
                  className="flex-1 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => handleUploadToTikTok(tiktokUploadModal.video)}
                  disabled={isUploadingToTiktok}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploadingToTiktok ? (
                    <>
                      <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                      </svg>
                      <span>Upload to TikTok</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoGenerator;
