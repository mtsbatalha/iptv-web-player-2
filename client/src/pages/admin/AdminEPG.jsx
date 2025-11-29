import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiCalendar, HiRefresh, HiCheck, HiExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function AdminEPG() {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSources();
    }, []);

    const loadSources = async () => {
        try {
            const response = await apiHelpers.getEpgSources();
            setSources(response.data.data.sources);
        } catch (error) {
            console.error('Erro ao carregar fontes EPG:', error);
        } finally {
            setLoading(false);
        }
    };

    const syncSource = async (id) => {
        try {
            toast.loading('Sincronizando EPG...', { id: `sync-${id}` });
            await apiHelpers.syncEpgSource(id);
            toast.success('EPG sincronizado!', { id: `sync-${id}` });
            loadSources();
        } catch (error) {
            toast.error('Erro ao sincronizar', { id: `sync-${id}` });
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
            <h1 className="text-2xl font-bold text-white">Fontes de EPG</h1>

            {sources.length > 0 ? (
                <div className="space-y-4">
                    {sources.map((source) => (
                        <div key={source.id} className="card p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-lg bg-purple-500/20">
                                    <HiCalendar className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-white">{source.name}</h3>
                                    <p className="text-sm text-gray-500 truncate max-w-md">{source.url}</p>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                        <span>{source.program_count || 0} programas</span>
                                        {source.last_updated_at && (
                                            <span>
                                                Atualizado: {new Date(source.last_updated_at).toLocaleString('pt-BR')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {source.sync_status === 'success' && (
                                    <HiCheck className="w-5 h-5 text-green-400" />
                                )}
                                {source.sync_status === 'error' && (
                                    <HiExclamation className="w-5 h-5 text-red-400" />
                                )}
                                <button
                                    onClick={() => syncSource(source.id)}
                                    className="btn btn-secondary"
                                >
                                    <HiRefresh className="w-5 h-5 mr-2" />
                                    Sincronizar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiCalendar className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">Nenhuma fonte de EPG configurada</p>
                </div>
            )}
        </div>
    );
}
