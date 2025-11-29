import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import toast from 'react-hot-toast';
import {
    HiPlus,
    HiRefresh,
    HiTrash,
    HiCheck,
    HiX,
    HiExclamation,
    HiClock,
    HiGlobe,
    HiChevronLeft,
    HiCalendar
} from 'react-icons/hi';
import clsx from 'clsx';

export default function EPGSettings() {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [syncingIds, setSyncingIds] = useState(new Set());
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Form state for adding new source
    const [formData, setFormData] = useState({
        name: '',
        url: '',
        autoUpdate: true,
        updateInterval: 6
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadSources();
    }, []);

    const loadSources = async () => {
        try {
            const response = await apiHelpers.getEpgSources();
            setSources(response.data.data.sources || []);
        } catch (error) {
            console.error('Erro ao carregar fontes de EPG:', error);
            toast.error('Erro ao carregar fontes de EPG');
        } finally {
            setLoading(false);
        }
    };

    const handleAddSource = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            await apiHelpers.addEpgSource(formData);
            toast.success('Fonte de EPG adicionada com sucesso');
            setShowAddModal(false);
            setFormData({ name: '', url: '', autoUpdate: true, updateInterval: 6 });
            loadSources();
        } catch (error) {
            console.error('Erro ao adicionar fonte:', error);
            toast.error(error.response?.data?.error?.message || 'Erro ao adicionar fonte');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSync = async (sourceId) => {
        setSyncingIds(prev => new Set([...prev, sourceId]));

        try {
            const response = await apiHelpers.syncEpgSource(sourceId);
            const { channelsImported, programsImported } = response.data.data;
            toast.success(`EPG sincronizado: ${channelsImported} canais, ${programsImported} programas`);
            loadSources();
        } catch (error) {
            console.error('Erro ao sincronizar:', error);
            toast.error(error.response?.data?.error?.message || 'Erro ao sincronizar EPG');
            loadSources(); // Reload to show error status
        } finally {
            setSyncingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(sourceId);
                return newSet;
            });
        }
    };

    const handleDelete = async (sourceId) => {
        try {
            await apiHelpers.deleteEpgSource(sourceId);
            toast.success('Fonte de EPG removida');
            setDeleteConfirm(null);
            loadSources();
        } catch (error) {
            console.error('Erro ao deletar:', error);
            toast.error(error.response?.data?.error?.message || 'Erro ao remover fonte');
        }
    };

    const getStatusBadge = (source) => {
        if (syncingIds.has(source.id) || source.sync_status === 'syncing') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Sincronizando
                </span>
            );
        }

        switch (source.sync_status) {
            case 'success':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                        <HiCheck className="w-3 h-3" />
                        Sincronizado
                    </span>
                );
            case 'error':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                        <HiX className="w-3 h-3" />
                        Erro
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
                        <HiClock className="w-3 h-3" />
                        Pendente
                    </span>
                );
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Nunca';
        return new Date(dateStr).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/epg" className="btn-icon" title="Voltar para Grade">
                        <HiChevronLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Fontes de EPG</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Gerencie as fontes de programação (XMLTV)
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Link to="/epg" className="btn-secondary">
                        <HiCalendar className="w-5 h-5" />
                        Ver Grade
                    </Link>
                    <button onClick={() => setShowAddModal(true)} className="btn-primary">
                        <HiPlus className="w-5 h-5" />
                        Adicionar Fonte
                    </button>
                </div>
            </div>

            {/* Sources List */}
            {sources.length > 0 ? (
                <div className="grid gap-4">
                    {sources.map((source) => (
                        <div key={source.id} className="card p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <HiGlobe className="w-5 h-5 text-primary-400 flex-shrink-0" />
                                        <h3 className="text-lg font-semibold text-white truncate">
                                            {source.name}
                                        </h3>
                                        {getStatusBadge(source)}
                                    </div>

                                    <p className="text-sm text-gray-400 truncate mb-3" title={source.url}>
                                        {source.url}
                                    </p>

                                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <HiClock className="w-4 h-4" />
                                            Última sync: {formatDate(source.last_updated_at)}
                                        </span>
                                        {source.program_count > 0 && (
                                            <span>
                                                {source.program_count.toLocaleString('pt-BR')} programas
                                            </span>
                                        )}
                                        {source.auto_update && (
                                            <span className="text-green-400">
                                                Auto-atualização: {source.update_interval}h
                                            </span>
                                        )}
                                    </div>

                                    {source.sync_error && (
                                        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                                            <HiExclamation className="w-4 h-4 inline mr-1" />
                                            {source.sync_error}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleSync(source.id)}
                                        disabled={syncingIds.has(source.id)}
                                        className={clsx(
                                            'btn-icon',
                                            syncingIds.has(source.id) && 'opacity-50 cursor-not-allowed'
                                        )}
                                        title="Sincronizar"
                                    >
                                        <HiRefresh className={clsx(
                                            'w-5 h-5',
                                            syncingIds.has(source.id) && 'animate-spin'
                                        )} />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(source)}
                                        className="btn-icon text-red-400 hover:bg-red-500/20"
                                        title="Remover"
                                    >
                                        <HiTrash className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiGlobe className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhuma fonte de EPG
                    </h3>
                    <p className="text-gray-400 mb-6">
                        Adicione uma fonte XMLTV para exibir a grade de programação
                    </p>
                    <button onClick={() => setShowAddModal(true)} className="btn-primary">
                        <HiPlus className="w-5 h-5" />
                        Adicionar Fonte
                    </button>
                </div>
            )}

            {/* Info Card */}
            <div className="card p-4 bg-dark-800/50">
                <h4 className="font-medium text-white mb-2">Como funciona o EPG?</h4>
                <ul className="text-sm text-gray-400 space-y-1">
                    <li>• O EPG (Electronic Program Guide) exibe a programação dos canais</li>
                    <li>• Adicione uma URL de arquivo XMLTV (geralmente fornecido pelo seu provedor IPTV)</li>
                    <li>• Após sincronizar, a grade de programação estará disponível</li>
                    <li>• Os canais são mapeados automaticamente pelo tvg-id da playlist</li>
                </ul>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 rounded-xl max-w-lg w-full p-6 animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-4">
                            Adicionar Fonte de EPG
                        </h2>

                        <form onSubmit={handleAddSource} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Nome
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="input w-full"
                                    placeholder="Ex: EPG Brasil"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    URL do XMLTV
                                </label>
                                <input
                                    type="url"
                                    value={formData.url}
                                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    className="input w-full"
                                    placeholder="https://exemplo.com/epg.xml"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Suporta arquivos .xml e .xml.gz
                                </p>
                            </div>

                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.autoUpdate}
                                        onChange={(e) => setFormData({ ...formData, autoUpdate: e.target.checked })}
                                        className="w-4 h-4 rounded border-gray-600 text-primary-500 focus:ring-primary-500 bg-dark-700"
                                    />
                                    <span className="text-sm text-gray-300">Atualização automática</span>
                                </label>

                                {formData.autoUpdate && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">a cada</span>
                                        <select
                                            value={formData.updateInterval}
                                            onChange={(e) => setFormData({ ...formData, updateInterval: parseInt(e.target.value) })}
                                            className="input py-1 px-2 w-20"
                                        >
                                            <option value={1}>1h</option>
                                            <option value={3}>3h</option>
                                            <option value={6}>6h</option>
                                            <option value={12}>12h</option>
                                            <option value={24}>24h</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="btn-secondary flex-1"
                                    disabled={submitting}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex-1"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Adicionando...
                                        </>
                                    ) : (
                                        <>
                                            <HiPlus className="w-5 h-5" />
                                            Adicionar
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 rounded-xl max-w-md w-full p-6 animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-2">
                            Remover Fonte de EPG
                        </h2>
                        <p className="text-gray-400 mb-6">
                            Tem certeza que deseja remover <strong className="text-white">{deleteConfirm.name}</strong>?
                            Todos os dados de programação desta fonte serão perdidos.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="btn-secondary flex-1"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm.id)}
                                className="btn-danger flex-1"
                            >
                                <HiTrash className="w-5 h-5" />
                                Remover
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
