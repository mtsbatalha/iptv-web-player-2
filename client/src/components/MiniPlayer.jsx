import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { HiX, HiPlay, HiPause, HiArrowsExpand, HiExternalLink } from 'react-icons/hi';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export default function MiniPlayer() {
    const navigate = useNavigate();
    const containerRef = useRef(null);
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const mpegtsRef = useRef(null);

    const { channel, streamUrl, isPlaying, isMiniPlayer, stop, expand, setPlaying } = usePlayerStore();
    const [playing, setLocalPlaying] = useState(true);
    const [loading, setLoading] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);

    // Initialize player when mini player is active
    useEffect(() => {
        if (!isMiniPlayer || !streamUrl || !videoRef.current) return;

        const video = videoRef.current;
        setLoading(true);
        setLocalPlaying(true);

        // Cleanup previous instances
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (mpegtsRef.current) {
            mpegtsRef.current.destroy();
            mpegtsRef.current = null;
        }

        // Detect stream type (same logic as VideoPlayer)
        const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8');
        const isTs = streamUrl.includes('.ts') && !isHls;
        const isProxy = streamUrl.includes('/api/stream/');

        // Convert to absolute URL for mpegts.js (Web Worker needs absolute URLs)
        const absoluteUrl = streamUrl.startsWith('http')
            ? streamUrl
            : `${window.location.origin}${streamUrl}`;

        console.log('[MiniPlayer] Initializing stream:', { streamUrl, isHls, isTs, isProxy });

        if (isHls && Hls.isSupported()) {
            console.log('[MiniPlayer] Using HLS.js');
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 60
            });

            hls.loadSource(absoluteUrl);
            hls.attachMedia(video);
            hlsRef.current = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setLoading(false);
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('[MiniPlayer] HLS error:', data);
                    setLoading(false);
                }
            });
        } else if ((isTs || isProxy) && mpegts.isSupported()) {
            console.log('[MiniPlayer] Using mpegts.js for:', absoluteUrl);
            const player = mpegts.createPlayer({
                type: 'mpegts',
                url: absoluteUrl,
                isLive: true
            }, {
                enableWorker: true,
                enableStashBuffer: false,
                stashInitialSize: 128,
                lazyLoad: false,
                lazyLoadMaxDuration: 0,
                deferLoadAfterSourceOpen: false
            });

            player.attachMediaElement(video);
            player.load();
            mpegtsRef.current = player;

            player.on(mpegts.Events.ERROR, (type, detail) => {
                console.error('[MiniPlayer] mpegts error:', type, detail);
            });

            const handleCanPlay = () => {
                console.log('[MiniPlayer] Stream ready');
                setLoading(false);
                video.play().catch(() => {});
            };

            video.addEventListener('canplay', handleCanPlay, { once: true });
        } else {
            console.log('[MiniPlayer] Using native playback');
            video.src = absoluteUrl;
            video.addEventListener('canplay', () => {
                setLoading(false);
                video.play().catch(() => {});
            }, { once: true });
        }

        return () => {
            console.log('[MiniPlayer] Cleanup');
            if (hlsRef.current) {
                try {
                    hlsRef.current.destroy();
                } catch (e) {
                    console.warn('[MiniPlayer] Error destroying HLS player:', e);
                }
                hlsRef.current = null;
            }
            if (mpegtsRef.current) {
                try {
                    mpegtsRef.current.destroy();
                } catch (e) {
                    console.warn('[MiniPlayer] Error destroying mpegts player:', e);
                }
                mpegtsRef.current = null;
            }
        };
    }, [isMiniPlayer, streamUrl]);

    // Handle play/pause
    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;

        if (playing) {
            video.pause();
        } else {
            video.play();
        }
        setLocalPlaying(!playing);
        setPlaying(!playing);
    };

    // Handle fullscreen toggle
    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            containerRef.current.requestFullscreen();
        }
    };

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Handle open in channel page
    const handleOpenChannel = () => {
        if (channel) {
            expand();
            navigate(`/channels/${channel.id}`);
        }
    };

    // Handle close
    const handleClose = () => {
        if (hlsRef.current) {
            try {
                hlsRef.current.destroy();
            } catch (e) {
                console.warn('[MiniPlayer] Error destroying HLS player on close:', e);
            }
            hlsRef.current = null;
        }
        if (mpegtsRef.current) {
            try {
                mpegtsRef.current.destroy();
            } catch (e) {
                console.warn('[MiniPlayer] Error destroying mpegts player on close:', e);
            }
            mpegtsRef.current = null;
        }
        stop();
    };

    // Don't render if not in mini player mode
    if (!isMiniPlayer || !channel) return null;

    return (
        <div
            ref={containerRef}
            className={`fixed z-50 bg-dark-900 shadow-2xl overflow-hidden border border-dark-700 ${
                fullscreen
                    ? 'inset-0 w-full h-full rounded-none border-none'
                    : 'bottom-4 right-4 w-80 rounded-lg'
            }`}
        >
            {/* Video */}
            <div className={`relative bg-black ${fullscreen ? 'h-full' : 'aspect-video'}`}>
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    playsInline
                    muted={false}
                />

                {/* Loading overlay */}
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {/* Controls overlay */}
                <div className={`absolute inset-0 flex flex-col justify-between opacity-0 hover:opacity-100 transition-opacity ${fullscreen ? 'bg-gradient-to-t from-black/80 via-transparent to-black/50' : 'bg-black/30'}`}>
                    {/* Top bar (fullscreen only) */}
                    {fullscreen && (
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-lg font-medium text-white">{channel.name}</p>
                                <p className="text-sm text-gray-300">{channel.group_title}</p>
                            </div>
                        </div>
                    )}

                    {/* Center play button */}
                    <div className="flex-1 flex items-center justify-center">
                        <button
                            onClick={togglePlay}
                            className={`rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors ${fullscreen ? 'p-4' : 'p-2'}`}
                        >
                            {playing ? <HiPause className={fullscreen ? 'w-12 h-12' : 'w-8 h-8'} /> : <HiPlay className={fullscreen ? 'w-12 h-12' : 'w-8 h-8'} />}
                        </button>
                    </div>

                    {/* Bottom controls (fullscreen) */}
                    {fullscreen && (
                        <div className="flex items-center justify-end gap-2 p-4">
                            <button
                                onClick={handleOpenChannel}
                                className="p-2 text-white hover:text-primary-400 transition-colors"
                                title="Abrir página do canal"
                            >
                                <HiExternalLink className="w-6 h-6" />
                            </button>
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 text-white hover:text-primary-400 transition-colors"
                                title="Sair da tela cheia"
                            >
                                <HiX className="w-6 h-6" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Info bar (mini mode only) */}
            {!fullscreen && (
                <div className="flex items-center justify-between p-2 bg-dark-800">
                    <div className="flex-1 min-w-0 mr-2">
                        <p className="text-sm font-medium text-white truncate">{channel.name}</p>
                        <p className="text-xs text-gray-400 truncate">{channel.group_title}</p>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleOpenChannel}
                            className="p-1.5 text-gray-400 hover:text-white transition-colors"
                            title="Abrir página do canal"
                        >
                            <HiExternalLink className="w-5 h-5" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 text-gray-400 hover:text-white transition-colors"
                            title="Tela cheia"
                        >
                            <HiArrowsExpand className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleClose}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                            title="Fechar"
                        >
                            <HiX className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
