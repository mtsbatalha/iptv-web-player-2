import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import { usePlayerStore } from '../stores/playerStore';
import {
    HiArrowLeft, HiHeart, HiVideoCamera, HiCalendar,
    HiShare, HiDotsVertical
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function ChannelPlayer() {
    const { id } = useParams();
    const navigate = useNavigate();

    const { play, minimize, expand, isMiniPlayer, channel: storeChannel } = usePlayerStore();

    const [channel, setChannel] = useState(null);
    const [streamUrl, setStreamUrl] = useState(null);
    const [epg, setEpg] = useState({ current: null, next: null });
    const [relatedChannels, setRelatedChannels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    // If returning from mini player to same channel, expand it
    useEffect(() => {
        if (isMiniPlayer && storeChannel && storeChannel.id === parseInt(id)) {
            expand();
        }
    }, [id, isMiniPlayer, storeChannel, expand]);

    useEffect(() => {
        loadChannel();
    }, [id]);

    // Register channel with global player store when loaded
    useEffect(() => {
        if (channel && streamUrl) {
            play(channel, streamUrl);
        }
    }, [channel, streamUrl]);

    // Minimize to mini player when leaving this page
    useEffect(() => {
        return () => {
            // Only minimize if we're actually playing this channel
            const currentChannel = usePlayerStore.getState().channel;
            if (currentChannel && currentChannel.id === parseInt(id)) {
                minimize();
            }
        };
    }, [id, minimize]);

    const loadChannel = async () => {
        setLoading(true);
        try {
            // Carregar dados do canal
            const channelRes = await apiHelpers.getChannel(id);
            const channelData = channelRes.data.data.channel;
            setChannel(channelData);

            // Obter token de stream - usar proxy para evitar CORS
            const tokenRes = await apiHelpers.getStreamToken(id);
            // Preferir proxy URL, usar directUrl apenas como fallback
            const proxyUrl = tokenRes.data.data.streamUrl;
            const directUrl = tokenRes.data.data.directUrl;
            // Usar proxy do backend para evitar CORS
            setStreamUrl(proxyUrl);

            // Carregar EPG
            if (channelData.tvgId) {
                try {
                    const epgRes = await apiHelpers.getCurrentProgram(id);
                    setEpg(epgRes.data.data);
                } catch (e) {
                    console.log('EPG não disponível');
                }
            }

            // Registrar no histórico
            apiHelpers.addToHistory({ channelId: parseInt(id), deviceType: 'web' }).catch(() => {});

            // Carregar canais relacionados (mesma categoria)
            if (channelData.groupTitle) {
                const relatedRes = await apiHelpers.getChannels({
                    groupTitle: channelData.groupTitle,
                    limit: 10
                });
                setRelatedChannels(
                    relatedRes.data.data.channels.filter(ch => ch.id !== parseInt(id))
                );
            }
        } catch (error) {
            console.error('Erro ao carregar canal:', error);
            toast.error('Erro ao carregar canal');
        } finally {
            setLoading(false);
        }
    };

    const toggleFavorite = async () => {
        try {
            if (channel.isFavorite) {
                await apiHelpers.removeFavorite(channel.id);
                toast.success('Removido dos favoritos');
            } else {
                await apiHelpers.addFavorite(channel.id);
                toast.success('Adicionado aos favoritos');
            }
            setChannel(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
        } catch (error) {
            toast.error('Erro ao atualizar favorito');
        }
    };

    const startRecording = async () => {
        try {
            const response = await apiHelpers.startRecording({
                channelId: channel.id,
                title: `${channel.name} - ${new Date().toLocaleString()}`,
                duration: 60
            });

            toast.success('Gravação iniciada');
            setShowMenu(false);
        } catch (error) {
            toast.error(error.response?.data?.error?.message || 'Erro ao iniciar gravação');
        }
    };

    const shareChannel = async () => {
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: channel.name,
                    url
                });
            } catch (e) {
                // Usuário cancelou
            }
        } else {
            await navigator.clipboard.writeText(url);
            toast.success('Link copiado!');
        }
        setShowMenu(false);
    };

    const formatProgress = (current) => {
        if (!current?.start_time || !current?.end_time) return 0;

        const start = new Date(current.start_time).getTime();
        const end = new Date(current.end_time).getTime();
        const now = Date.now();

        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!channel) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-400">Canal não encontrado</p>
                <button onClick={() => navigate('/channels')} className="btn btn-primary mt-4">
                    Voltar aos canais
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* Layout estilo YouTube - Player + Sidebar */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Coluna principal - Player e Info */}
                <div className="flex-1 max-w-4xl">
                    {/* Player Container */}
                    <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                        {streamUrl ? (
                            <div className="aspect-video">
                                <VideoPlayer
                                    src={streamUrl}
                                    poster={channel.logoUrl}
                                    title={channel.name}
                                    channelId={channel.id}
                                    channelName={channel.name}
                                    autoPlay
                                    className="w-full h-full"
                                />
                            </div>
                        ) : (
                            <div className="aspect-video bg-dark-900 flex items-center justify-center">
                                <p className="text-gray-400">Stream não disponível</p>
                            </div>
                        )}
                    </div>

                    {/* Channel Info - Abaixo do player */}
                    <div className="mt-4 space-y-4">
                        {/* Título e ações */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl font-bold text-white truncate">
                                    {channel.name}
                                </h1>
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                    <span className="text-sm text-gray-400">
                                        {channel.groupTitle || 'Sem categoria'}
                                    </span>
                                    {channel.quality && (
                                        <span className="badge badge-primary text-xs">{channel.quality}</span>
                                    )}
                                    {channel.streamType === 'live' && (
                                        <span className="flex items-center gap-1 text-xs text-red-400">
                                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                            AO VIVO
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Ações */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={toggleFavorite}
                                    className={clsx(
                                        'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                                        channel.isFavorite
                                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                            : 'bg-dark-700 text-gray-300 hover:bg-dark-600'
                                    )}
                                >
                                    <HiHeart className={clsx('w-5 h-5', channel.isFavorite && 'fill-current')} />
                                    {channel.isFavorite ? 'Favoritado' : 'Favoritar'}
                                </button>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowMenu(!showMenu)}
                                        className="p-2 rounded-full bg-dark-700 text-gray-300 hover:bg-dark-600 transition-colors"
                                    >
                                        <HiDotsVertical className="w-5 h-5" />
                                    </button>

                                    {showMenu && (
                                        <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-lg py-1 z-50">
                                            <button
                                                onClick={startRecording}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-700 flex items-center gap-2"
                                            >
                                                <HiVideoCamera className="w-4 h-4" />
                                                Gravar
                                            </button>
                                            <Link
                                                to={`/epg?channel=${id}`}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-700 flex items-center gap-2"
                                            >
                                                <HiCalendar className="w-4 h-4" />
                                                Ver programação
                                            </Link>
                                            <button
                                                onClick={shareChannel}
                                                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-dark-700 flex items-center gap-2"
                                            >
                                                <HiShare className="w-4 h-4" />
                                                Compartilhar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Canal info card */}
                        <div className="flex items-center gap-4 p-4 bg-dark-800 rounded-xl">
                            <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {channel.logoUrl ? (
                                    <img
                                        src={channel.logoUrl}
                                        alt={channel.name}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <span className="text-lg font-bold text-gray-500">
                                        {channel.name[0]}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white">{channel.name}</p>
                                <p className="text-sm text-gray-400">{channel.groupTitle}</p>
                            </div>
                            <button
                                onClick={() => navigate(-1)}
                                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm rounded-full transition-colors"
                            >
                                <HiArrowLeft className="w-4 h-4 inline mr-2" />
                                Voltar
                            </button>
                        </div>

                        {/* EPG Current Program */}
                        {epg.current && (
                            <div className="p-4 bg-dark-800 rounded-xl">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-primary-400 font-medium uppercase tracking-wider">Agora</span>
                                    <span className="text-xs text-gray-500">
                                        {new Date(epg.current.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        {' - '}
                                        {new Date(epg.current.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <h3 className="font-medium text-white">{epg.current.title}</h3>
                                {epg.current.description && (
                                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{epg.current.description}</p>
                                )}
                                <div className="mt-3 h-1 bg-dark-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary-500 transition-all"
                                        style={{ width: `${formatProgress(epg.current)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar - Canais relacionados */}
                <div className="lg:w-80 flex-shrink-0">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        Canais relacionados
                    </h2>

                    <div className="space-y-2">
                        {relatedChannels.slice(0, 10).map((ch) => (
                            <Link
                                key={ch.id}
                                to={`/channels/${ch.id}`}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-dark-800 group-hover:bg-dark-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {ch.logoUrl ? (
                                        <img
                                            src={ch.logoUrl}
                                            alt={ch.name}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <span className="text-sm font-bold text-gray-500">
                                            {ch.name[0]}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate group-hover:text-primary-400 transition-colors">
                                        {ch.name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {ch.groupTitle || 'Sem categoria'}
                                    </p>
                                </div>
                            </Link>
                        ))}

                        {relatedChannels.length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                                Nenhum canal relacionado
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
