import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import {
    HiPlay, HiSearch, HiHeart, HiViewGrid, HiViewList, HiClock
} from 'react-icons/hi';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function Channels() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [channels, setChannels] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('grid');
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
    const [epgData, setEpgData] = useState({});

    const search = searchParams.get('search') || '';
    const group = searchParams.get('group') || '';
    const streamType = searchParams.get('type') || '';

    useEffect(() => {
        loadChannels();
        loadGroups();
    }, [searchParams]);

    const loadChannels = async () => {
        setLoading(true);
        try {
            const response = await apiHelpers.getChannels({
                search,
                groupTitle: group || undefined,
                streamType: streamType || undefined,
                page: pagination.page,
                limit: 50
            });

            setChannels(response.data.data.channels);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error('Erro ao carregar canais:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadGroups = async () => {
        try {
            const response = await apiHelpers.getGroups();
            setGroups(response.data.data.groups);
        } catch (error) {
            console.error('Erro ao carregar grupos:', error);
        }
    };

    // Load EPG data for channels in list view
    useEffect(() => {
        if (viewMode !== 'list' || channels.length === 0) return;

        const loadEpgData = async () => {
            const data = {};
            // Load EPG for channels with tvgId (limit to first 20 for performance)
            const channelsWithEpg = channels.filter(ch => ch.tvgId).slice(0, 20);

            await Promise.all(channelsWithEpg.map(async (channel) => {
                try {
                    const response = await apiHelpers.getCurrentProgram(channel.id);
                    data[channel.id] = response.data.data;
                } catch (e) {
                    // EPG not available
                }
            }));

            setEpgData(data);
        };

        loadEpgData();
        // Refresh EPG every minute
        const interval = setInterval(loadEpgData, 60000);
        return () => clearInterval(interval);
    }, [channels, viewMode]);

    // Calculate program progress
    const getProgress = (program) => {
        if (!program?.start_time || !program?.end_time) return 0;
        const start = new Date(program.start_time).getTime();
        const end = new Date(program.end_time).getTime();
        const now = Date.now();
        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    };

    // Get remaining time
    const getTimeRemaining = (program) => {
        if (!program?.end_time) return '';
        const end = new Date(program.end_time).getTime();
        const remaining = Math.max(0, end - Date.now());
        const minutes = Math.floor(remaining / 60000);
        if (minutes >= 60) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours}h ${mins}min restantes`;
        }
        return `${minutes}min restantes`;
    };

    // Format time
    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const query = formData.get('search');

        if (query) {
            searchParams.set('search', query);
        } else {
            searchParams.delete('search');
        }
        setSearchParams(searchParams);
    };

    const handleGroupChange = (groupName) => {
        if (groupName) {
            searchParams.set('group', groupName);
        } else {
            searchParams.delete('group');
        }
        setSearchParams(searchParams);
    };

    const toggleFavorite = async (e, channel) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (channel.isFavorite) {
                await apiHelpers.removeFavorite(channel.id);
                toast.success('Removido dos favoritos');
            } else {
                await apiHelpers.addFavorite(channel.id);
                toast.success('Adicionado aos favoritos');
            }

            // Atualizar estado local
            setChannels(prev => prev.map(ch =>
                ch.id === channel.id ? { ...ch, isFavorite: !ch.isFavorite } : ch
            ));
        } catch (error) {
            toast.error('Erro ao atualizar favorito');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">Canais</h1>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={clsx('btn-icon', viewMode === 'grid' && 'bg-dark-700')}
                    >
                        <HiViewGrid className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={clsx('btn-icon', viewMode === 'list' && 'bg-dark-700')}
                    >
                        <HiViewList className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <form onSubmit={handleSearch} className="flex-1">
                    <div className="relative">
                        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            name="search"
                            defaultValue={search}
                            className="input pl-10"
                            placeholder="Buscar canais..."
                        />
                    </div>
                </form>

                {/* Group filter */}
                <select
                    value={group}
                    onChange={(e) => handleGroupChange(e.target.value)}
                    className="input max-w-xs"
                >
                    <option value="">Todas as categorias</option>
                    {groups.map((g) => (
                        <option key={g.name} value={g.name}>
                            {g.name} ({g.channel_count})
                        </option>
                    ))}
                </select>

                {/* Type filter */}
                <select
                    value={streamType}
                    onChange={(e) => {
                        if (e.target.value) {
                            searchParams.set('type', e.target.value);
                        } else {
                            searchParams.delete('type');
                        }
                        setSearchParams(searchParams);
                    }}
                    className="input max-w-xs"
                >
                    <option value="">Todos os tipos</option>
                    <option value="live">Ao vivo</option>
                    <option value="vod">Filmes</option>
                    <option value="series">Séries</option>
                </select>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="spinner"></div>
                </div>
            )}

            {/* Channels Grid */}
            {!loading && channels.length > 0 && (
                <div className={clsx(
                    viewMode === 'grid'
                        ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                        : 'space-y-2'
                )}>
                    {channels.map((channel) => (
                        viewMode === 'grid' ? (
                            <Link
                                key={channel.id}
                                to={`/channels/${channel.id}`}
                                className="card card-hover p-4 relative group"
                            >
                                {/* Favorite button */}
                                <button
                                    onClick={(e) => toggleFavorite(e, channel)}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-dark-800/80 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                >
                                    <HiHeart
                                        className={clsx(
                                            'w-4 h-4',
                                            channel.isFavorite ? 'text-red-500 fill-current' : 'text-gray-400'
                                        )}
                                    />
                                </button>

                                {/* Logo */}
                                <div className="aspect-square mb-3 rounded-lg bg-dark-800 flex items-center justify-center overflow-hidden">
                                    {channel.logoUrl ? (
                                        <img
                                            src={channel.logoUrl}
                                            alt={channel.name}
                                            className="w-full h-full object-contain p-2"
                                            loading="lazy"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.nextSibling.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <div className={clsx(
                                        'w-full h-full items-center justify-center',
                                        channel.logoUrl ? 'hidden' : 'flex'
                                    )}>
                                        <HiPlay className="w-8 h-8 text-gray-600" />
                                    </div>
                                </div>

                                {/* Info */}
                                <h3 className="font-medium text-sm text-white line-clamp-2 mb-1">
                                    {channel.name}
                                </h3>
                                <p className="text-xs text-gray-500 truncate">
                                    {channel.groupTitle || 'Sem categoria'}
                                </p>

                                {/* Quality badge */}
                                {channel.quality && (
                                    <span className="badge badge-primary mt-2">
                                        {channel.quality}
                                    </span>
                                )}
                            </Link>
                        ) : (
                            <Link
                                key={channel.id}
                                to={`/channels/${channel.id}`}
                                className="card card-hover p-4 flex items-start gap-4 group"
                            >
                                {/* Logo */}
                                <div className="w-16 h-16 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {channel.logoUrl ? (
                                        <img
                                            src={channel.logoUrl}
                                            alt={channel.name}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <HiPlay className="w-8 h-8 text-gray-600" />
                                    )}
                                </div>

                                {/* Channel Info & EPG */}
                                <div className="flex-1 min-w-0">
                                    {/* Channel Header */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-white truncate">
                                            {channel.name}
                                        </h3>
                                        {channel.quality && (
                                            <span className="badge badge-primary text-xs">
                                                {channel.quality}
                                            </span>
                                        )}
                                        {channel.streamType === 'live' && (
                                            <span className="flex items-center gap-1 text-xs text-red-400">
                                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                                                AO VIVO
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mb-2">
                                        {channel.groupTitle || 'Sem categoria'}
                                    </p>

                                    {/* EPG Info - TV Style */}
                                    {epgData[channel.id]?.current ? (
                                        <div className="space-y-2">
                                            {/* Current Program */}
                                            <div className="bg-dark-800/50 rounded-lg p-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-primary-400 font-medium">AGORA</span>
                                                    <span className="text-xs text-gray-500">
                                                        {formatTime(epgData[channel.id].current.start_time)} - {formatTime(epgData[channel.id].current.end_time)}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-white font-medium truncate">
                                                    {epgData[channel.id].current.title}
                                                </p>
                                                {/* Progress Bar */}
                                                <div className="mt-2 flex items-center gap-2">
                                                    <div className="flex-1 h-1 bg-dark-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary-500 transition-all"
                                                            style={{ width: `${getProgress(epgData[channel.id].current)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                                        {getTimeRemaining(epgData[channel.id].current)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Next Program */}
                                            {epgData[channel.id].next && (
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <HiClock className="w-3.5 h-3.5" />
                                                    <span className="text-gray-400">A seguir:</span>
                                                    <span className="text-gray-300 truncate">
                                                        {formatTime(epgData[channel.id].next.start_time)} - {epgData[channel.id].next.title}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600 italic">
                                            Programação não disponível
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                                    {/* Favorite */}
                                    <button
                                        onClick={(e) => toggleFavorite(e, channel)}
                                        className="p-2 rounded-lg hover:bg-dark-700 transition-colors"
                                    >
                                        <HiHeart
                                            className={clsx(
                                                'w-5 h-5',
                                                channel.isFavorite ? 'text-red-500 fill-current' : 'text-gray-400'
                                            )}
                                        />
                                    </button>
                                    {/* Play indicator */}
                                    <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <HiPlay className="w-5 h-5 text-primary-400" />
                                    </div>
                                </div>
                            </Link>
                        )
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && channels.length === 0 && (
                <div className="card p-12 text-center">
                    <HiPlay className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhum canal encontrado
                    </h3>
                    <p className="text-gray-400">
                        {search || group
                            ? 'Tente ajustar os filtros de busca'
                            : 'Adicione uma playlist para ver os canais'}
                    </p>
                </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: pagination.totalPages }, (_, i) => (
                        <button
                            key={i + 1}
                            onClick={() => {
                                searchParams.set('page', i + 1);
                                setSearchParams(searchParams);
                            }}
                            className={clsx(
                                'w-10 h-10 rounded-lg',
                                pagination.page === i + 1
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                            )}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
