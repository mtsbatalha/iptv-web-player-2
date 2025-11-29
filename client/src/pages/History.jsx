import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import { HiClock, HiTrash, HiPlay } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function History() {
    const [history, setHistory] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const response = await apiHelpers.getHistory({ limit: 100 });
            setHistory(response.data.data.history);
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearHistory = async () => {
        if (!confirm('Deseja limpar todo o histórico?')) return;

        try {
            await apiHelpers.clearHistory();
            toast.success('Histórico limpo');
            setHistory({});
        } catch (error) {
            toast.error('Erro ao limpar histórico');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="spinner"></div>
            </div>
        );
    }

    const dates = Object.keys(history).sort().reverse();

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Histórico</h1>
                {dates.length > 0 && (
                    <button onClick={clearHistory} className="btn btn-secondary text-red-400">
                        <HiTrash className="w-5 h-5 mr-2" />
                        Limpar
                    </button>
                )}
            </div>

            {dates.length > 0 ? (
                <div className="space-y-6">
                    {dates.map((date) => (
                        <div key={date}>
                            <h2 className="text-sm font-medium text-gray-400 mb-3">
                                {new Date(date).toLocaleDateString('pt-BR', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long'
                                })}
                            </h2>

                            <div className="space-y-2">
                                {history[date].map((item) => (
                                    <Link
                                        key={item.id}
                                        to={`/channels/${item.channel.id}`}
                                        className="card card-hover p-4 flex items-center gap-4"
                                    >
                                        <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {item.channel.logoUrl ? (
                                                <img
                                                    src={item.channel.logoUrl}
                                                    alt={item.channel.name}
                                                    className="w-full h-full object-contain"
                                                />
                                            ) : (
                                                <HiPlay className="w-6 h-6 text-gray-600" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">
                                                {item.channel.name}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {new Date(item.watchedAt).toLocaleTimeString('pt-BR', {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiClock className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhum histórico
                    </h3>
                    <p className="text-gray-400">
                        Os canais que você assistir aparecerão aqui
                    </p>
                </div>
            )}
        </div>
    );
}
