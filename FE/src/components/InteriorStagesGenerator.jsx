import React, { useState, useRef, useEffect } from 'react';
import { Play, Image, Video, Zap, Info, X, Upload, Clock, Edit3 } from 'lucide-react';
import VideoModelSelector from './VideoModelSelector';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
const FALLBACK_THUMBNAIL = 'https://placehold.co/600x400?text=Generating';

// Duration options for each video model
const VIDEO_MODEL_DURATIONS = {
  "Kling O1": { durations: ["5s", "10s"], default: "5s" },
  "Kling 2.6": { durations: ["5s", "10s"], default: "5s" },
  "Kling 2.5 Turbo": { durations: ["5s", "10s"], default: "5s" },
  "Kling Motion Control": { durations: ["5s", "10s"], default: "5s" },
  "Veo 3": { durations: ["4s", "6s", "8s"], default: "6s" },
  "Veo 3.1": { durations: ["4s", "6s", "8s"], default: "6s" },
  "Veo 3 Fast": { durations: ["4s", "6s", "8s"], default: "4s" }
};

// Default prompts
const DEFAULT_START_FRAME_PROMPT = "Empty interior space, finished walls ceiling and floor, no furniture, no decor, no people, clean architectural realism, neutral daylight, eye-level camera.";
const DEFAULT_END_FRAME_PROMPT = "Fully furnished and decorated interior space, all furniture in place, complete decor elements including rugs cushions wall art and plants, warm cinematic lighting, magazine-quality interior photography, no people.";
const DEFAULT_VIDEO_PROMPT = "Furniture and decor gradually appear in their final positions. Objects emerge naturally and settle in place. NO sliding, NO snapping, NO teleportation. Camera COMPLETELY STATIC. Lighting stable and realistic.";

// Helper function to format time duration
const formatTime = (seconds) => {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (mins === 0 && secs === 0) {
      return `${hours}h`;
    } else if (secs === 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${hours}h ${mins}m ${secs}s`;
    }
  }
};

const InteriorStagesGenerator = ({
  selectedModel,
  setSelectedModel,
  models,
  modelsLoading,
  selectedVideoModel,
  setSelectedVideoModel,
  aspectRatio = '16:9',
  resolution = '720p',
  onGenerationsUpdate
}) => {
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [interiorStages, setInteriorStages] = useState(null);
  const [stagesProgress, setStagesProgress] = useState({});
  const [videosProgress, setVideosProgress] = useState({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [imageZoomModal, setImageZoomModal] = useState({ show: false, imageUrl: null });
  
  // New state for custom prompts
  const [startFramePrompt, setStartFramePrompt] = useState(DEFAULT_START_FRAME_PROMPT);
  const [endFramePrompt, setEndFramePrompt] = useState(DEFAULT_END_FRAME_PROMPT);
  const [videoPrompt, setVideoPrompt] = useState(DEFAULT_VIDEO_PROMPT);
  const [selectedDuration, setSelectedDuration] = useState("5s");
  
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Update duration when video model changes
  useEffect(() => {
    if (selectedVideoModel?.name) {
      const modelDurations = VIDEO_MODEL_DURATIONS[selectedVideoModel.name];
      if (modelDurations) {
        setSelectedDuration(modelDurations.default);
      }
    }
  }, [selectedVideoModel]);

  // Get duration options for current video model
  const getDurationOptions = () => {
    if (selectedVideoModel?.name && VIDEO_MODEL_DURATIONS[selectedVideoModel.name]) {
      return VIDEO_MODEL_DURATIONS[selectedVideoModel.name].durations;
    }
    return ["5s", "10s"]; // Default
  };

  // Poll for video status updates
  useEffect(() => {
    if (!interiorStages?.videos || interiorStages.videos.length === 0) return;

    const pollInterval = setInterval(async () => {
      // STOP: Check if any video failed - stop polling immediately
      const failedVideos = interiorStages.videos.filter(video => {
        const status = videosProgress[video.generationId] || video.status;
        return status === 'failed';
      });

      if (failedVideos.length > 0) {
        console.error('❌ Video generation failed. Stopping polling.');
        clearInterval(pollInterval);
        setIsGenerating(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        alert(`❌ Generation Stopped:\n\nVideo ${failedVideos[0].videoNumber} failed: ${failedVideos[0].error || 'Unknown error'}\n\nPlease check your inputs and try again.`);
        return;
      }

      const inProgressVideos = interiorStages.videos.filter(video => {
        const status = videosProgress[video.generationId] || video.status;
        return status === 'in_progress';
      });

      if (inProgressVideos.length === 0) {
        clearInterval(pollInterval);
        setIsGenerating(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      // Check status for each in-progress video
      for (const video of inProgressVideos) {
        try {
          const response = await fetch(`${API_BASE_URL}/generations/${video.generationId}/check-status`);
          const data = await response.json();

          if (data.status === 'completed' || data.status === 'failed') {
            setVideosProgress(prev => ({
              ...prev,
              [video.generationId]: data.status
            }));

            // Update generations list if completed
            if (data.status === 'completed' && onGenerationsUpdate) {
              onGenerationsUpdate({
                id: video.generationId,
                prompt: video.title || `Interior transformation: ${video.fromStage} → ${video.toStage}`,
                model: video.modelName || 'Kling O1',
                duration: selectedDuration,
                aspectRatio: aspectRatio,
                resolution: resolution,
                status: 'completed',
                feature: 'image-to-video',
                createdAt: new Date(),
                thumbnail: data.thumbnailUrl || FALLBACK_THUMBNAIL,
                videoUrl: data.videoUrl || FALLBACK_THUMBNAIL
              });
            }
          }
        } catch (error) {
          console.error(`Error checking status for video ${video.generationId}:`, error);
        }
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [interiorStages, videosProgress, aspectRatio, resolution, onGenerationsUpdate, selectedDuration]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedImageFile(file);
      setInteriorStages(null);
      setStagesProgress({});
      setVideosProgress({});
      setElapsedTime(0);
    }
  };

  const handleRemoveImage = () => {
    setUploadedImageFile(null);
    setInteriorStages(null);
    setStagesProgress({});
    setVideosProgress({});
    setElapsedTime(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleGenerate = async () => {
    // Validate inputs
    if (!models || models.length === 0) {
      alert('⚠️ Models are not loaded yet. Please wait and try again.');
      return;
    }

    if (!selectedModel) {
      alert('⚠️ No image model selected. Please select an image model first.');
      return;
    }

    if (selectedModel.capabilities?.supportedFeatures && 
        !selectedModel.capabilities.supportedFeatures.includes('image-to-image')) {
      alert(`⚠️ Model "${selectedModel.name}" does not support image-to-image generation.\n\nPlease select Kling O1 or another model that supports image-to-image.`);
      return;
    }

    if (!selectedVideoModel) {
      alert('⚠️ No video model selected. Please select a video model for generating animation videos.');
      return;
    }

    if (selectedVideoModel.capabilities?.supportedFeatures && 
        !selectedVideoModel.capabilities.supportedFeatures.includes('image-to-video')) {
      alert(`⚠️ Model "${selectedVideoModel.name}" does not support image-to-video generation.\n\nPlease select a model that supports image-to-video (e.g., Kling O1, Kling 2.6).`);
      return;
    }

    if (!uploadedImageFile) {
      alert('⚠️ Please upload an interior reference image first.');
      return;
    }

    if (!startFramePrompt.trim()) {
      alert('⚠️ Please enter a prompt for the Start Frame.');
      return;
    }

    if (!endFramePrompt.trim()) {
      alert('⚠️ Please enter a prompt for the End Frame.');
      return;
    }

    setIsGenerating(true);
    setInteriorStages(null);
    setStagesProgress({});
    setVideosProgress({});
    
    // Start timer
    startTimeRef.current = Date.now();
    setElapsedTime(0);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    try {
      const formData = new FormData();
      formData.append('image', uploadedImageFile);
      formData.append('modelName', selectedModel.name);
      formData.append('videoModelName', selectedVideoModel?.name || 'Kling O1');
      formData.append('aspectRatio', aspectRatio || '16:9');
      formData.append('startFramePrompt', startFramePrompt);
      formData.append('endFramePrompt', endFramePrompt);
      formData.append('videoPrompt', videoPrompt);
      formData.append('duration', selectedDuration);

      const response = await fetch(`${API_BASE_URL}/generations/interior-stages`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // STOP: If request failed or success is false, stop immediately
        const errorMessage = data.error || data.message || `Failed to generate interior stages (${response.status})`;
        throw new Error(errorMessage);
      }

      // Check if any stage failed - STOP if so
      const failedStages = data.stages?.filter((stage) => !stage.success) || [];
      if (failedStages.length > 0) {
        const failedStage = failedStages[0];
        const errorMessage = `Generation stopped at stage ${failedStage.stageOrder}: ${failedStage.error || 'Unknown error'}`;
        throw new Error(errorMessage);
      }

      // Update progress for each stage
      const progress = {};
      data.stages.forEach((stage) => {
        if (stage.success) {
          progress[stage.stageKey] = 'completed';
        } else {
          progress[stage.stageKey] = 'failed';
        }
      });
      setStagesProgress(progress);

      setInteriorStages(data);
      
      // Add all successful stages to generations list
      data.stages.forEach(stage => {
        if (stage.success && stage.imageUrl && onGenerationsUpdate) {
          const mappedStage = {
            id: stage.generationId,
            prompt: stage.prompt,
            model: selectedModel.name,
            duration: '0s',
            aspectRatio: aspectRatio || '16:9',
            resolution: resolution || '720p',
            status: 'completed',
            feature: 'image-to-image',
            createdAt: new Date(),
            thumbnail: stage.imageUrl,
            imageUrl: stage.imageUrl,
            inputImageUrl: uploadedImageFile ? URL.createObjectURL(uploadedImageFile) : null
          };
          onGenerationsUpdate(mappedStage);
        }
      });

      // Handle videos
      if (data.videos && data.videos.length > 0) {
        console.log(`🎬 ${data.videos.length} interior transformation video is being generated...`);
        
        const videoProgress = {};
        data.videos.forEach(video => {
          if (video.generationId) {
            videoProgress[video.generationId] = video.status;
            
            if (onGenerationsUpdate) {
              const mappedVideo = {
                id: video.generationId,
                prompt: video.title || `Interior transformation: ${video.fromStage} → ${video.toStage}`,
                model: video.modelName || 'Kling O1',
                duration: selectedDuration,
                aspectRatio: aspectRatio || '16:9',
                resolution: resolution || '720p',
                status: video.status || 'in_progress',
                feature: 'image-to-video',
                createdAt: new Date(),
                thumbnail: FALLBACK_THUMBNAIL,
                videoUrl: FALLBACK_THUMBNAIL,
                errorMessage: video.error || undefined,
                errorCode: video.error ? 'GENERATION_FAILED' : undefined
              };
              onGenerationsUpdate(mappedVideo);
            }
          }
        });
        setVideosProgress(videoProgress);
      }

      setIsGenerating(false);
    } catch (error) {
      console.error('❌ Error generating interior stages:', error);
      
      // STOP: Clear timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // STOP: Reset states
      setIsGenerating(false);
      setElapsedTime(0);
      startTimeRef.current = null;
      
      // STOP: Show error message
      alert(`❌ Generation Stopped:\n\n${error.message}\n\nPlease check your inputs and try again.`);
      
      // STOP: Clear any partial results
      setInteriorStages(null);
      setStagesProgress({});
      setVideosProgress({});
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Loading or no models
  if (modelsLoading || !models || models.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-neutral-800/80 border border-neutral-700 rounded-xl p-4 flex items-center gap-3">
          {modelsLoading ? (
            <>
              <div className="h-5 w-5 border-2 border-neutral-500 border-t-white rounded-full animate-spin" />
              <span className="text-neutral-400 text-sm">Đang tải danh sách model...</span>
            </>
          ) : (
            <span className="text-neutral-400 text-sm">Chưa có model. Kiểm tra banner phía trên hoặc chạy <code className="bg-neutral-700 px-1 rounded">npm run seed</code> trong BE.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-purple-300">
            <strong>Interior Transformation Feature:</strong> Generate 2 images (Start Frame → End Frame) and 1 transition video. Enter your own prompts and select video duration. Camera remains static throughout.
          </div>
        </div>
      </div>

      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Upload Interior Reference Image
        </label>
        {uploadedImageFile ? (
          <div className="relative">
            <div className="w-full h-48 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700">
              <img
                src={URL.createObjectURL(uploadedImageFile)}
                alt="Uploaded interior"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={handleRemoveImage}
              className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="w-full h-32 border-2 border-dashed border-neutral-600 rounded-lg cursor-pointer hover:border-purple-500 transition-colors flex items-center justify-center">
            <div className="text-center">
              <Upload size={24} className="text-neutral-400 mx-auto mb-2" />
              <span className="text-sm text-neutral-400">Click to upload interior image</span>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Start Frame Prompt */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
          <Edit3 size={14} className="text-blue-400" />
          Start Frame Prompt (Image 1)
        </label>
        <textarea
          value={startFramePrompt}
          onChange={(e) => setStartFramePrompt(e.target.value)}
          placeholder="Describe the starting state of your interior..."
          className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-purple-500 focus:outline-none resize-none"
        />
        <div className="text-xs text-neutral-500 mt-1">
          Describe the initial empty or starting state of the interior
        </div>
      </div>

      {/* End Frame Prompt */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
          <Edit3 size={14} className="text-green-400" />
          End Frame Prompt (Image 2)
        </label>
        <textarea
          value={endFramePrompt}
          onChange={(e) => setEndFramePrompt(e.target.value)}
          placeholder="Describe the final furnished state of your interior..."
          className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-purple-500 focus:outline-none resize-none"
        />
        <div className="text-xs text-neutral-500 mt-1">
          Describe the final fully furnished and decorated state
        </div>
      </div>

      {/* Video Prompt */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
          <Video size={14} className="text-purple-400" />
          Video Transition Prompt
        </label>
        <textarea
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="Describe how the transition should animate..."
          className="w-full h-20 bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-200 placeholder-neutral-500 focus:border-purple-500 focus:outline-none resize-none"
        />
        <div className="text-xs text-neutral-500 mt-1">
          Describe the animation style for the Start → End transition
        </div>
      </div>

      {/* Image Model Selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Image Model (for image generation)
        </label>
        <VideoModelSelector
          models={models.filter(model => 
            model.capabilities?.supportedFeatures?.includes('image-to-image') || 
            model.capabilities?.supportedFeatures?.includes('text-to-image')
          )}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          loading={modelsLoading}
        />
      </div>

      {/* Video Model Selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Video Model (for animation video)
        </label>
        <VideoModelSelector 
          models={models.filter(model => 
            model.capabilities?.supportedFeatures?.includes('image-to-video') || 
            model.capabilities?.supportedFeatures?.includes('text-to-video')
          )}
          selectedModel={selectedVideoModel}
          onModelChange={setSelectedVideoModel}
          loading={modelsLoading}
        />
      </div>

      {/* Duration Selector */}
      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
          <Clock size={14} className="text-yellow-400" />
          Video Duration
        </label>
        <div className="flex gap-2 flex-wrap">
          {getDurationOptions().map((duration) => (
            <button
              key={duration}
              onClick={() => setSelectedDuration(duration)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedDuration === duration
                  ? 'bg-purple-500 text-white'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-600'
              }`}
            >
              {duration}
            </button>
          ))}
        </div>
        <div className="text-xs text-neutral-500 mt-2">
          Available durations for {selectedVideoModel?.name || 'selected model'}
        </div>
      </div>

      {/* Generate Button */}
      <button 
        onClick={handleGenerate}
        disabled={isGenerating || !uploadedImageFile}
        className="w-full bg-purple-500 hover:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
      >
        <Zap size={18} />
        <span>
          {isGenerating 
            ? 'Generating...' 
            : `✨ Generate Interior Transformation (2 Images + 1 Video, ${selectedDuration})`}
        </span>
      </button>

      {/* Timer Display */}
      {(isGenerating || elapsedTime > 0) && (
        <div className="text-sm text-center">
          <div className="text-neutral-400 mb-1">
            Generating 2 images, then creating 1 transition video ({selectedDuration}). This may take a few minutes...
          </div>
          {elapsedTime > 0 && (
            <div className="text-purple-400 font-bold text-lg">
              ⏱️ Total Time: {formatTime(elapsedTime)}
            </div>
          )}
        </div>
      )}

      {/* Results Display */}
      {interiorStages && (
        <div className="mt-6 space-y-6">
          {/* Stages Summary */}
          <div className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <Image className="w-5 h-5 text-purple-400" />
              Generated Images ({interiorStages.stages?.length || 0})
            </h3>
            {interiorStages.videos && interiorStages.videos.length > 0 && (
              <div className="text-sm text-purple-300 mb-2">
                🎬 {interiorStages.videos.length} transition video ({selectedDuration}) is being generated...
              </div>
            )}
          </div>

          {/* Display Images - 2 columns */}
          <div className="grid grid-cols-2 gap-4">
            {(interiorStages.stages || [])
              .sort((a, b) => a.stageOrder - b.stageOrder)
              .map((stage) => (
                <div
                  key={stage.stageKey}
                  className={`bg-neutral-800/50 rounded-lg p-4 border ${
                    stage.success ? 'border-purple-500/50' : 'border-red-500/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      stage.stageKey === 'start-frame' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {stage.stageOrder}
                    </div>
                    <div className="text-sm font-medium text-white">
                      {stage.stageKey === 'start-frame' ? 'Start Frame' : 'End Frame'}
                    </div>
                  </div>
                  {stage.success && stage.imageUrl ? (
                    <div 
                      className="relative w-full aspect-video rounded overflow-hidden bg-neutral-700 cursor-zoom-in"
                      onClick={() => setImageZoomModal({ show: true, imageUrl: stage.imageUrl })}
                    >
                      <img
                        src={stage.imageUrl}
                        alt={`${stage.stageKey}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Image size={24} className="text-white opacity-0 hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-video rounded bg-red-900/20 flex items-center justify-center">
                      <div className="text-xs text-red-400 text-center">
                        ❌ Failed
                        {stage.error && (
                          <div className="mt-1 text-[10px]">{stage.error}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>

          {/* Display Videos */}
          {interiorStages.videos && interiorStages.videos.length > 0 && (
            <div className="pt-6 border-t border-neutral-700">
              <h4 className="text-md font-bold mb-3 text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                Transition Video
              </h4>
              <div className="space-y-3">
                {interiorStages.videos
                  .sort((a, b) => a.videoNumber - b.videoNumber)
                  .map((video) => {
                    const videoStatus = videosProgress[video.generationId] || video.status;
                    return (
                      <div
                        key={video.generationId || video.videoNumber}
                        className="flex items-center gap-3 p-4 bg-neutral-800/50 rounded-lg border border-neutral-700"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <Play className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white">
                            Start Frame → End Frame
                          </div>
                          <div className="text-xs text-neutral-400">
                            Duration: {selectedDuration} | Model: {video.modelName || selectedVideoModel?.name || 'Kling O1'}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {videoStatus === 'in_progress' && (
                            <span className="text-xs px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                              Generating...
                            </span>
                          )}
                          {videoStatus === 'completed' && (
                            <span className="text-xs px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full">
                              ✓ Completed
                            </span>
                          )}
                          {videoStatus === 'failed' && (
                            <span className="text-xs px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full">
                              ✗ Failed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Zoom Modal */}
      {imageZoomModal.show && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setImageZoomModal({ show: false, imageUrl: null })}
        >
          <div className="relative max-w-7xl max-h-full">
            <img
              src={imageZoomModal.imageUrl}
              alt="Zoomed"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setImageZoomModal({ show: false, imageUrl: null })}
              className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white rounded-full p-2"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteriorStagesGenerator;
