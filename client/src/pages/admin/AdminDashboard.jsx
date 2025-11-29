import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiUsers, HiCollection, HiVideoCamera, HiCalendar } from 'react-icons/hi';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await apiHelpers.getAdminStats();
            setStats(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        } finally {
            setLoading(false);
        }
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
            <h1 className="text-2xl font-bold text-white">Dashboard Administrativo</h1>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-primary-500/20">
                            <HiUsers className="w-8 h-8 text-primary-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.users?.total || 0}</p>
                            <p className="text-sm text-gray-400">Usuários</p>
                            <p className="text-xs text-green-400 mt-1">
                                +{stats?.users?.new_this_week || 0} esta semana
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-green-500/20">
                            <HiCollection className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.playlists?.total || 0}</p>
                            <p className="text-sm text-gray-400">Playlists</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {stats?.playlists?.total_channels || 0} canais
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-red-500/20">
                            <HiVideoCamera className="w-8 h-8 text-red-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.recordings?.total || 0}</p>
                            <p className="text-sm text-gray-400">Gravações</p>
                            <p className="text-xs text-yellow-400 mt-1">
                                {stats?.recordings?.active || 0} ativas
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-purple-500/20">
                            <HiCalendar className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-white">{stats?.epg?.sources || 0}</p>
                            <p className="text-sm text-gray-400">Fontes EPG</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {stats?.epg?.active_programs || 0} programas
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Atividade Recente</h2>

                {stats?.recentActivity?.length > 0 ? (
                    <div className="space-y-3">
                        {stats.recentActivity.map((activity, index) => (
                            <div key={index} className="flex items-center justify-between py-2 border-b border-dark-800 last:border-0">
                                <div>
                                    <p className="text-sm text-white">{activity.action}</p>
                                    <p className="text-xs text-gray-500">
                                        {activity.username || 'Sistema'} - {activity.entity_type}
                                    </p>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {new Date(activity.created_at).toLocaleString('pt-BR')}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400">Nenhuma atividade recente</p>
                )}
            </div>
        </div>
    );
}
