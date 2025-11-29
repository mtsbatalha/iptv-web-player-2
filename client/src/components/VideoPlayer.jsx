import { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import {
    HiPlay, HiPause, HiVolumeUp, HiVolumeOff,
    HiArrowsExpand, HiX, HiRefresh, HiCog
} from 'react-icons/hi';
import { MdSubtitles, MdAudiotrack, MdPictureInPictureAlt } from 'react-icons/md';
import clsx from 'clsx';
import RecordingControls, { RecordingIndicator } from './RecordingControls';

export default function VideoPlayer({
    src,
    poster,
    title,
    channelId,
    channelName,
    autoPlay = true,
    onError,
    onPlay,
    onPause,
    onEnded,
    className,
    showRecordingControls = true
}) {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const mpegtsRef = useRef(null);
    const containerRef = useRef(null);
    const controlsTimeoutRef = useRef(null);
    const playbackStartedRef = useRef(false);

    const [playing, setPlaying] = useState(false);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [qualities, setQualities] = useState([]);
    const [currentQuality, setCurrentQuality] = useState(-1);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState('quality'); // 'quality', 'audio', 'subtitles'
    const [pip, setPip] = useState(false);

    // Audio and subtitle tracks
    const [audioTracks, setAudioTracks] = useState([]);
    const [currentAudioTrack, setCurrentAudioTrack] = useState(-1);
    const [subtitleTracks, setSubtitleTracks] = useState([]);
    const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1);
    const [isHlsStream, setIsHlsStream] = useState(false);

    // Função para inicializar mpegts.js (para streams TS)
    const initMpegts = useCallback((video, streamUrl) => {
        if (!mpegts.isSupported()) {
            console.error('mpegts.js not supported');
            setError('Navegador não suporta este formato de stream');
            setLoading(false);
            return null;
        }

        console.log('Iniciando mpegts.js para stream TS');

        const player = mpegts.createPlayer({
            type: 'mpegts',
            isLive: true,
            url: streamUrl
        }, {
            enableWorker: true,
            enableStashBuffer: false,
            stashInitialSize: 128
        });

        player.attachMediaElement(video);
        player.load();

        player.on(mpegts.Events.ERROR, (errorType, errorDetail) => {
            console.error('mpegts error:', errorType, errorDetail);
            setError('Erro ao reproduzir stream');
            setLoading(false);
        });

        player.on(mpegts.Events.LOADING_COMPLETE, () => {
            setLoading(false);
        });

        return player;
    }, []);

    // Inicializar player
    useEffect(() => {
        if (!src || !videoRef.current) return;

        const video = videoRef.current;
        setError(null);
        setLoading(true);

        // Detectar tipo de stream
        const isHls = src.includes('.m3u8') || src.includes('m3u8');
        const isTs = src.includes('.ts') && !isHls;
        const isProxy = src.includes('/api/stream/');
        const isMp4 = src.includes('.mp4') || src.includes('/recordings/');
        const isRecording = src.includes('/recordings/');

        // Cleanup função
        const cleanup = () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (mpegtsRef.current) {
                mpegtsRef.current.destroy();
                mpegtsRef.current = null;
            }
        };

        // Para MP4 e gravações - usar reprodução nativa diretamente
        if (isMp4 || isRecording) {
            console.log('Usando reprodução nativa para MP4/gravação:', src);
            video.src = src;

            const handleCanPlay = () => {
                setLoading(false);
                if (autoPlay) {
                    video.play().catch((err) => {
                        // Ignore AbortError from React strict mode double-mount
                        if (err.name !== 'AbortError') {
                            console.error('Play error:', err);
                        }
                    });
                }
            };

            const handleError = () => {
                console.error('Error loading video:', video.error);
                setLoading(false);
                setError('Erro ao carregar vídeo');
            };

            video.addEventListener('canplay', handleCanPlay, { once: true });
            video.addEventListener('error', handleError, { once: true });
            video.load();

            return () => {
                video.removeEventListener('canplay', handleCanPlay);
                video.removeEventListener('error', handleError);
                cleanup();
            };
        }

        // Reset tracks state
        setAudioTracks([]);
        setSubtitleTracks([]);
        setQualities([]);
        setIsHlsStream(false);

        // Para HLS streams
        if (isHls && Hls.isSupported()) {
            setIsHlsStream(true);
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                fragLoadingTimeOut: 20000,
                manifestLoadingTimeOut: 20000,
                levelLoadingTimeOut: 20000
            });

            hlsRef.current = hls;
            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                setLoading(false);
                setQualities(data.levels.map((level, index) => ({
                    index,
                    height: level.height,
                    bitrate: level.bitrate
                })));

                // Get audio tracks
                if (hls.audioTracks && hls.audioTracks.length > 0) {
                    setAudioTracks(hls.audioTracks.map((track, index) => ({
                        index,
                        id: track.id,
                        name: track.name || `Audio ${index + 1}`,
                        lang: track.lang || 'unknown',
                        default: track.default
                    })));
                    setCurrentAudioTrack(hls.audioTrack);
                }

                // Get subtitle tracks
                if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
                    setSubtitleTracks(hls.subtitleTracks.map((track, index) => ({
                        index,
                        id: track.id,
                        name: track.name || `Subtitle ${index + 1}`,
                        lang: track.lang || 'unknown',
                        default: track.default
                    })));
                    setCurrentSubtitleTrack(hls.subtitleTrack);
                }

                if (autoPlay) video.play().catch(console.error);
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
                setCurrentQuality(data.level);
            });

            // Audio track events
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
                if (data.audioTracks && data.audioTracks.length > 0) {
                    setAudioTracks(data.audioTracks.map((track, index) => ({
                        index,
                        id: track.id,
                        name: track.name || `Audio ${index + 1}`,
                        lang: track.lang || 'unknown',
                        default: track.default
                    })));
                }
            });

            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
                setCurrentAudioTrack(data.id);
            });

            // Subtitle track events
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
                if (data.subtitleTracks && data.subtitleTracks.length > 0) {
                    setSubtitleTracks(data.subtitleTracks.map((track, index) => ({
                        index,
                        id: track.id,
                        name: track.name || `Subtitle ${index + 1}`,
                        lang: track.lang || 'unknown',
                        default: track.default
                    })));
                }
            });

            hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (event, data) => {
                setCurrentSubtitleTrack(data.id);
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('HLS fatal error:', data.type, data.details);
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        setError('Erro ao reproduzir stream');
                        setLoading(false);
                    }
                }
            });

            return cleanup;
        }

        // Para streams TS diretos ou proxy streams (tentar mpegts.js)
        if ((isTs || isProxy) && mpegts.isSupported()) {
            // mpegts.js precisa de URL absoluta (Web Worker não resolve URLs relativas)
            const absoluteUrl = src.startsWith('http') ? src : `${window.location.origin}${src}`;
            console.log('Tentando mpegts.js para stream:', absoluteUrl);

            // Reset playback started flag
            playbackStartedRef.current = false;

            const player = initMpegts(video, absoluteUrl);
            if (player) {
                mpegtsRef.current = player;

                // Iniciar reprodução quando pronto
                const handleCanPlay = () => {
                    console.log('mpegts: canplay event fired');
                    playbackStartedRef.current = true;
                    setLoading(false);
                    if (autoPlay) video.play().catch(console.error);
                };

                video.addEventListener('canplay', handleCanPlay, { once: true });

                // Also listen for playing event as backup
                const handlePlaying = () => {
                    console.log('mpegts: playing event fired');
                    playbackStartedRef.current = true;
                    setLoading(false);
                };

                video.addEventListener('playing', handlePlaying);

                // Timeout de fallback - only if playback hasn't started
                const timeout = setTimeout(() => {
                    if (!playbackStartedRef.current && !video.currentTime) {
                        console.log('mpegts timeout, playback not started, trying native playback...');
                        player.destroy();
                        mpegtsRef.current = null;
                        video.src = absoluteUrl;
                        video.load();
                        setLoading(false);
                        if (autoPlay) video.play().catch(console.error);
                    } else {
                        console.log('mpegts: playback already started, ignoring timeout');
                    }
                }, 15000);

                return () => {
                    clearTimeout(timeout);
                    video.removeEventListener('canplay', handleCanPlay);
                    video.removeEventListener('playing', handlePlaying);
                    cleanup();
                };
            }
        }

        // Safari ou fallback para reprodução nativa
        if (video.canPlayType('application/vnd.apple.mpegurl') ||
            video.canPlayType('video/mp2t')) {
            video.src = src;
            setLoading(false);
            if (autoPlay) video.play().catch(console.error);
            return cleanup;
        }

        // Último fallback - tentar reprodução direta
        console.log('Tentando reprodução direta:', src);
        video.src = src;
        setLoading(false);
        if (autoPlay) video.play().catch(console.error);

        return cleanup;
    }, [src, autoPlay, initMpegts]);

    // Event listeners do vídeo
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlay = () => {
            setPlaying(true);
            onPlay?.();
        };

        const handlePause = () => {
            setPlaying(false);
            onPause?.();
        };

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        const handleDurationChange = () => {
            setDuration(video.duration);
        };

        const handleProgress = () => {
            if (video.buffered.length > 0) {
                setBuffered(video.buffered.end(video.buffered.length - 1));
            }
        };

        const handleWaiting = () => setLoading(true);
        const handlePlaying = () => setLoading(false);

        const handleError = () => {
            setError('Erro ao reproduzir vídeo');
            setLoading(false);
            onError?.();
        };

        const handleEnded = () => {
            setPlaying(false);
            onEnded?.();
        };

        // Detect native audio tracks (for non-HLS streams)
        const detectNativeTracks = () => {
            // Audio tracks (limited browser support)
            if (video.audioTracks && video.audioTracks.length > 1) {
                const tracks = [];
                for (let i = 0; i < video.audioTracks.length; i++) {
                    const track = video.audioTracks[i];
                    tracks.push({
                        index: i,
                        id: track.id || i,
                        name: track.label || track.language || `Audio ${i + 1}`,
                        lang: track.language || 'unknown',
                        default: track.enabled
                    });
                    if (track.enabled) {
                        setCurrentAudioTrack(i);
                    }
                }
                setAudioTracks(prev => prev.length === 0 ? tracks : prev);
            }

            // Text tracks (subtitles/captions)
            if (video.textTracks && video.textTracks.length > 0) {
                const tracks = [];
                for (let i = 0; i < video.textTracks.length; i++) {
                    const track = video.textTracks[i];
                    if (track.kind === 'subtitles' || track.kind === 'captions') {
                        tracks.push({
                            index: i,
                            id: i,
                            name: track.label || track.language || `Subtitle ${i + 1}`,
                            lang: track.language || 'unknown',
                            default: track.mode === 'showing'
                        });
                        if (track.mode === 'showing') {
                            setCurrentSubtitleTrack(i);
                        }
                    }
                }
                setSubtitleTracks(prev => prev.length === 0 ? tracks : prev);
            }
        };

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('durationchange', handleDurationChange);
        video.addEventListener('progress', handleProgress);
        video.addEventListener('loadedmetadata', detectNativeTracks);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('error', handleError);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('durationchange', handleDurationChange);
            video.removeEventListener('progress', handleProgress);
            video.removeEventListener('loadedmetadata', detectNativeTracks);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('error', handleError);
            video.removeEventListener('ended', handleEnded);
        };
    }, [onPlay, onPause, onError, onEnded]);

    // Auto-hide controls
    useEffect(() => {
        if (showControls && playing) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [showControls, playing]);

    // Fullscreen change
    useEffect(() => {
        const handleFullscreenChange = () => {
            setFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Keyboard shortcuts for video control
    useEffect(() => {
        const handleKeyDown = (e) => {
            const video = videoRef.current;
            if (!video) return;

            // Only handle if video player container is focused or no input is focused
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                return;
            }

            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    if (playing) video.pause();
                    else video.play().catch(() => {});
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    video.currentTime = Math.min(duration || Infinity, video.currentTime + 10);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    setVolume(video.volume);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    setVolume(video.volume);
                    break;
                case 'm':
                    e.preventDefault();
                    video.muted = !video.muted;
                    setMuted(video.muted);
                    break;
                case 'f':
                    e.preventDefault();
                    if (containerRef.current) {
                        if (document.fullscreenElement) {
                            document.exitFullscreen();
                        } else {
                            containerRef.current.requestFullscreen();
                        }
                    }
                    break;
                case 'p':
                    e.preventDefault();
                    if (document.pictureInPictureEnabled && videoRef.current) {
                        if (document.pictureInPictureElement) {
                            document.exitPictureInPicture();
                        } else {
                            videoRef.current.requestPictureInPicture();
                        }
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playing, duration]);

    // Picture-in-Picture events
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleEnterPip = () => setPip(true);
        const handleLeavePip = () => setPip(false);

        video.addEventListener('enterpictureinpicture', handleEnterPip);
        video.addEventListener('leavepictureinpicture', handleLeavePip);

        return () => {
            video.removeEventListener('enterpictureinpicture', handleEnterPip);
            video.removeEventListener('leavepictureinpicture', handleLeavePip);
        };
    }, []);

    // Controls
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (playing) {
            video.pause();
        } else {
            video.play();
        }
    }, [playing]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = !muted;
        setMuted(!muted);
    }, [muted]);

    const handleVolumeChange = useCallback((e) => {
        const video = videoRef.current;
        if (!video) return;

        const newVolume = parseFloat(e.target.value);
        video.volume = newVolume;
        setVolume(newVolume);
        setMuted(newVolume === 0);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;

        if (fullscreen) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen();
        }
    }, [fullscreen]);

    const togglePip = useCallback(async () => {
        const video = videoRef.current;
        if (!video) return;

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled) {
                await video.requestPictureInPicture();
            }
        } catch (err) {
            console.error('Erro ao alternar Picture-in-Picture:', err);
        }
    }, []);

    const handleQualityChange = useCallback((level) => {
        if (hlsRef.current) {
            hlsRef.current.currentLevel = level;
        }
        setShowSettings(false);
    }, []);

    const handleAudioTrackChange = useCallback((trackIndex) => {
        if (hlsRef.current) {
            hlsRef.current.audioTrack = trackIndex;
        } else if (videoRef.current && videoRef.current.audioTracks) {
            // Native audio track support (limited browser support)
            for (let i = 0; i < videoRef.current.audioTracks.length; i++) {
                videoRef.current.audioTracks[i].enabled = (i === trackIndex);
            }
        }
        setCurrentAudioTrack(trackIndex);
        setShowSettings(false);
    }, []);

    const handleSubtitleTrackChange = useCallback((trackIndex) => {
        if (hlsRef.current) {
            hlsRef.current.subtitleTrack = trackIndex;
        } else if (videoRef.current) {
            // Native text track support
            const textTracks = videoRef.current.textTracks;
            for (let i = 0; i < textTracks.length; i++) {
                textTracks[i].mode = (i === trackIndex) ? 'showing' : 'hidden';
            }
        }
        setCurrentSubtitleTrack(trackIndex);
        setShowSettings(false);
    }, []);

    const retry = useCallback(() => {
        setError(null);
        setLoading(true);

        if (hlsRef.current) {
            hlsRef.current.startLoad();
        } else if (mpegtsRef.current) {
            mpegtsRef.current.unload();
            mpegtsRef.current.load();
        } else if (videoRef.current) {
            videoRef.current.load();
            videoRef.current.play().catch(console.error);
        }
    }, []);

    const formatTime = (seconds) => {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Seek to position when clicking on progress bar
    const handleSeek = useCallback((e) => {
        if (!videoRef.current || !duration || !isFinite(duration)) return;

        const progressBar = e.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const seekTime = percentage * duration;

        videoRef.current.currentTime = seekTime;
        setCurrentTime(seekTime);
    }, [duration]);

    const getQualityLabel = (quality) => {
        if (quality.height) {
            return `${quality.height}p`;
        }
        if (quality.bitrate) {
            return `${Math.round(quality.bitrate / 1000)}kbps`;
        }
        return `Level ${quality.index}`;
    };

    return (
        <div
            ref={containerRef}
            className={clsx(
                'video-player group relative',
                fullscreen && 'fullscreen',
                className
            )}
            onMouseMove={() => setShowControls(true)}
            onMouseLeave={() => playing && setShowControls(false)}
        >
            {/* Video */}
            <video
                ref={videoRef}
                className="w-full h-full"
                poster={poster}
                playsInline
                onClick={togglePlay}
            />

            {/* Recording indicator at top */}
            {showRecordingControls && channelId && (
                <RecordingIndicator channelId={channelId} />
            )}

            {/* Loading */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="spinner w-12 h-12"></div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={retry} className="btn btn-primary">
                        <HiRefresh className="w-5 h-5 mr-2" />
                        Tentar novamente
                    </button>
                </div>
            )}

            {/* Controls */}
            <div
                className={clsx(
                    'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300',
                    showControls ? 'opacity-100' : 'opacity-0'
                )}
            >
                {/* Title */}
                {title && (
                    <div className="mb-4">
                        <h3 className="text-white font-medium">{title}</h3>
                    </div>
                )}

                {/* Progress bar (para VOD) */}
                {duration > 0 && isFinite(duration) && (
                    <div
                        className="relative h-1 bg-gray-700 rounded mb-4 cursor-pointer group py-2 -my-2"
                        onClick={handleSeek}
                    >
                        <div className="relative h-1">
                            <div
                                className="absolute h-full bg-gray-500 rounded"
                                style={{ width: `${(buffered / duration) * 100}%` }}
                            />
                            <div
                                className="absolute h-full bg-primary-500 rounded"
                                style={{ width: `${(currentTime / duration) * 100}%` }}
                            />
                            {/* Seek handle */}
                            <div
                                className="absolute w-3 h-3 bg-primary-400 rounded-full -top-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
                            />
                        </div>
                    </div>
                )}

                {/* Controls row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Play/Pause */}
                        <button onClick={togglePlay} className="text-white hover:text-primary-400 transition-colors">
                            {playing ? <HiPause className="w-8 h-8" /> : <HiPlay className="w-8 h-8" />}
                        </button>

                        {/* Volume */}
                        <div className="flex items-center gap-2">
                            <button onClick={toggleMute} className="text-white hover:text-primary-400">
                                {muted || volume === 0 ? (
                                    <HiVolumeOff className="w-6 h-6" />
                                ) : (
                                    <HiVolumeUp className="w-6 h-6" />
                                )}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={muted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-20 h-1 bg-gray-600 rounded appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Time */}
                        {duration > 0 && isFinite(duration) && (
                            <span className="text-sm text-gray-300">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </span>
                        )}

                        {/* Live indicator */}
                        {(!duration || !isFinite(duration)) && playing && (
                            <span className="flex items-center gap-2 text-sm">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                AO VIVO
                            </span>
                        )}

                        {/* Recording controls */}
                        {showRecordingControls && channelId && (
                            <RecordingControls
                                channelId={channelId}
                                channelName={channelName || title}
                                compact={false}
                            />
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Settings (Quality, Audio, Subtitles) */}
                        {(qualities.length > 0 || audioTracks.length > 0 || subtitleTracks.length > 0) && (
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        setShowSettings(!showSettings);
                                        setSettingsTab('quality');
                                    }}
                                    className="text-white hover:text-primary-400"
                                >
                                    <HiCog className="w-6 h-6" />
                                </button>

                                {showSettings && (
                                    <div className="absolute bottom-full right-0 mb-2 bg-dark-800 border border-dark-700 rounded-lg overflow-hidden min-w-[180px]">
                                        {/* Tabs */}
                                        <div className="flex border-b border-dark-700">
                                            {qualities.length > 0 && (
                                                <button
                                                    onClick={() => setSettingsTab('quality')}
                                                    className={clsx(
                                                        'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                                                        settingsTab === 'quality'
                                                            ? 'text-primary-400 bg-dark-700'
                                                            : 'text-gray-400 hover:text-white'
                                                    )}
                                                >
                                                    Qualidade
                                                </button>
                                            )}
                                            {audioTracks.length > 0 && (
                                                <button
                                                    onClick={() => setSettingsTab('audio')}
                                                    className={clsx(
                                                        'flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                                                        settingsTab === 'audio'
                                                            ? 'text-primary-400 bg-dark-700'
                                                            : 'text-gray-400 hover:text-white'
                                                    )}
                                                >
                                                    <MdAudiotrack className="w-3.5 h-3.5" />
                                                    Áudio
                                                </button>
                                            )}
                                            {subtitleTracks.length > 0 && (
                                                <button
                                                    onClick={() => setSettingsTab('subtitles')}
                                                    className={clsx(
                                                        'flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1',
                                                        settingsTab === 'subtitles'
                                                            ? 'text-primary-400 bg-dark-700'
                                                            : 'text-gray-400 hover:text-white'
                                                    )}
                                                >
                                                    <MdSubtitles className="w-3.5 h-3.5" />
                                                    Legendas
                                                </button>
                                            )}
                                        </div>

                                        {/* Quality tab content */}
                                        {settingsTab === 'quality' && qualities.length > 0 && (
                                            <div className="py-1">
                                                <button
                                                    onClick={() => handleQualityChange(-1)}
                                                    className={clsx(
                                                        'w-full px-3 py-1.5 text-left text-sm hover:bg-dark-700',
                                                        currentQuality === -1 && 'text-primary-400'
                                                    )}
                                                >
                                                    Auto
                                                </button>
                                                {qualities.map((q) => (
                                                    <button
                                                        key={q.index}
                                                        onClick={() => handleQualityChange(q.index)}
                                                        className={clsx(
                                                            'w-full px-3 py-1.5 text-left text-sm hover:bg-dark-700',
                                                            currentQuality === q.index && 'text-primary-400'
                                                        )}
                                                    >
                                                        {getQualityLabel(q)}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Audio tab content */}
                                        {settingsTab === 'audio' && audioTracks.length > 0 && (
                                            <div className="py-1 max-h-48 overflow-y-auto">
                                                {audioTracks.map((track) => (
                                                    <button
                                                        key={track.index}
                                                        onClick={() => handleAudioTrackChange(track.index)}
                                                        className={clsx(
                                                            'w-full px-3 py-1.5 text-left text-sm hover:bg-dark-700 flex items-center justify-between',
                                                            currentAudioTrack === track.index && 'text-primary-400'
                                                        )}
                                                    >
                                                        <span>{track.name}</span>
                                                        {track.lang !== 'unknown' && (
                                                            <span className="text-xs text-gray-500 uppercase">{track.lang}</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Subtitles tab content */}
                                        {settingsTab === 'subtitles' && subtitleTracks.length > 0 && (
                                            <div className="py-1 max-h-48 overflow-y-auto">
                                                <button
                                                    onClick={() => handleSubtitleTrackChange(-1)}
                                                    className={clsx(
                                                        'w-full px-3 py-1.5 text-left text-sm hover:bg-dark-700',
                                                        currentSubtitleTrack === -1 && 'text-primary-400'
                                                    )}
                                                >
                                                    Desativado
                                                </button>
                                                {subtitleTracks.map((track) => (
                                                    <button
                                                        key={track.index}
                                                        onClick={() => handleSubtitleTrackChange(track.index)}
                                                        className={clsx(
                                                            'w-full px-3 py-1.5 text-left text-sm hover:bg-dark-700 flex items-center justify-between',
                                                            currentSubtitleTrack === track.index && 'text-primary-400'
                                                        )}
                                                    >
                                                        <span>{track.name}</span>
                                                        {track.lang !== 'unknown' && (
                                                            <span className="text-xs text-gray-500 uppercase">{track.lang}</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Picture-in-Picture */}
                        {document.pictureInPictureEnabled && (
                            <button
                                onClick={togglePip}
                                className={clsx(
                                    'text-white hover:text-primary-400 transition-colors',
                                    pip && 'text-primary-400'
                                )}
                                title="Picture-in-Picture (P)"
                            >
                                <MdPictureInPictureAlt className="w-6 h-6" />
                            </button>
                        )}

                        {/* Fullscreen */}
                        <button onClick={toggleFullscreen} className="text-white hover:text-primary-400">
                            {fullscreen ? <HiX className="w-6 h-6" /> : <HiArrowsExpand className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
