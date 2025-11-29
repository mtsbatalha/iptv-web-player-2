import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiHelpers } from '../services/api';
import {
    HiPlay, HiCollection, HiHeart, HiClock,
    HiVideoCamera, HiPlus, HiArrowRight
} from 'react-icons/hi';

export default function Dashboard() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState(null);
    const [recentHistory, setRecentHistory] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const [statsRes, favRes] = await Promise.all([
                apiHelpers.getUserStats(),
                apiHelpers.getFavorites()
            ]);

            setStats(statsRes.data.data.stats);
            setRecentHistory(statsRes.data.data.recentHistory || []);
            setFavorites(favRes.data.data.favorites?.slice(0, 6) || []);
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatWatchTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Welcome */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Olá, {user?.firstName || user?.username}!
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Bem-vindo ao seu painel de IPTV
                    </p>
                </div>
                <Link to="/playlists" className="btn btn-primary">
                    <HiPlus className="w-5 h-5 mr-2" />
                    Nova Playlist
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-primary-500/20">
                            <HiCollection className="w-6 h-6 text-primary-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.playlists || 0}</p>
                            <p className="text-sm text-gray-400">Playlists</p>
                        </div>
                    </div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-green-500/20">
                            <HiPlay className="w-6 h-6 text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.channels || 0}</p>
                            <p className="text-sm text-gray-400">Canais</p>
                        </div>
                    </div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-red-500/20">
                            <HiHeart className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">{stats?.favorites || 0}</p>
                            <p className="text-sm text-gray-400">Favoritos</p>
                        </div>
                    </div>
                </div>

                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-lg bg-purple-500/20">
                            <HiClock className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-white">
                                {formatWatchTime(stats?.totalWatchTime || 0)}
                            </p>
                            <p className="text-sm text-gray-400">Assistido</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Info */}
            <div className="card p-6 bg-gradient-to-r from-primary-900/50 to-purple-900/50 border-primary-800">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-primary-300">Seu plano atual</p>
                        <h3 className="text-xl font-bold text-white mt-1">
                            {user?.plan?.name || 'Free'}
                        </h3>
                        <p className="text-sm text-gray-400 mt-2">
                            {user?.plan?.limits?.maxPlaylists === -1
                                ? 'Playlists ilimitadas'
                                : `${stats?.playlists || 0}/${user?.plan?.limits?.maxPlaylists} playlists`
                            }
                        </p>
                    </div>
                    {user?.plan?.name === 'Free' && (
                        <Link to="/settings" className="btn btn-primary">
                            Fazer Upgrade
                        </Link>
                    )}
                </div>
            </div>

            {/* Favorites */}
            {favorites.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Favoritos</h2>
                        <Link to="/favorites" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1">
                            Ver todos <HiArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {favorites.map((fav) => (
                            <Link
                                key={fav.id}
                                to={`/channels/${fav.channel.id}`}
                                className="card card-hover p-3 text-center"
                            >
                                <div className="w-16 h-16 mx-auto mb-2 rounded-lg bg-dark-800 flex items-center justify-center overflow-hidden">
                                    {fav.channel.logoUrl ? (
                                        <img
                                            src={fav.channel.logoUrl}
                                            alt={fav.channel.name}
                                            className="w-full h-full object-contain"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                            }}
                                        />
                                    ) : null}
                                    <span
                                        className="text-2xl font-bold text-gray-500"
                                        style={{ display: fav.channel.logoUrl ? 'none' : 'flex' }}
                                    >
                                        {fav.channel.name?.[0] || '?'}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-white line-clamp-1">
                                    {fav.channel.name}
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent History */}
            {recentHistory.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Assistidos recentemente</h2>
                        <Link to="/history" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1">
                            Ver histórico <HiArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recentHistory.map((item, index) => (
                            <Link
                                key={index}
                                to={`/channels/${item.channel_id}`}
                                className="card card-hover p-4 flex items-center gap-4 group"
                            >
                                <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {item.logo_url ? (
                                        <img
                                            src={item.logo_url}
                                            alt={item.channel_name}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <HiPlay className="w-6 h-6 text-gray-500" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate group-hover:text-primary-400 transition-colors">
                                        {item.channel_name}
                                    </p>
                                    <p className="text-sm text-gray-400">
                                        {item.group_title || new Date(item.watched_at).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <HiPlay className="w-8 h-8 text-gray-600 group-hover:text-primary-400 transition-colors" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!favorites.length && !recentHistory.length && (
                <div className="card p-12 text-center">
                    <HiVideoCamera className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Comece a assistir
                    </h3>
                    <p className="text-gray-400 mb-6">
                        Adicione uma playlist para começar a explorar canais
                    </p>
                    <Link to="/playlists" className="btn btn-primary">
                        <HiPlus className="w-5 h-5 mr-2" />
                        Adicionar Playlist
                    </Link>
                </div>
            )}
        </div>
    );
}
