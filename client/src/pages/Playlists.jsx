import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import {
    HiPlus, HiLink, HiUpload, HiRefresh, HiTrash,
    HiDotsVertical, HiCheck, HiExclamation, HiClock
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function Playlists() {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState('url');
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        name: '',
        sourceUrl: '',
        autoUpdate: true,
        updateInterval: 24
    });

    useEffect(() => {
        loadPlaylists();
    }, []);

    const loadPlaylists = async () => {
        try {
            const response = await apiHelpers.getPlaylists();
            setPlaylists(response.data.data.playlists);
        } catch (error) {
            console.error('Erro ao carregar playlists:', error);
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setShowAddModal(false);
        setSubmitting(false);
        setFormData({ name: '', sourceUrl: '', autoUpdate: true, updateInterval: 24 });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Prevenir duplo clique
        if (submitting) return;

        setSubmitting(true);

        try {
            if (addType === 'url') {
                const response = await apiHelpers.createPlaylistFromUrl({
                    name: formData.name,
                    sourceUrl: formData.sourceUrl,
                    autoUpdate: formData.autoUpdate,
                    updateInterval: formData.updateInterval
                });

                // Verificar se está sincronizando ou já concluiu
                if (response.data.data.status === 'syncing') {
                    toast.success('Playlist criada! Sincronizando canais em background...', { duration: 4000 });
                } else {
                    toast.success('Playlist adicionada com sucesso!');
                }
            } else {
                const file = fileInputRef.current?.files[0];
                if (!file) {
                    toast.error('Selecione um arquivo');
                    setSubmitting(false);
                    return;
                }

                const formDataObj = new FormData();
                formDataObj.append('playlist', file);
                formDataObj.append('name', formData.name || file.name);

                await apiHelpers.uploadPlaylist(formDataObj);
                toast.success('Playlist adicionada com sucesso!');
            }

            // Fechar modal e resetar form
            closeModal();

            // Recarregar lista imediatamente
            loadPlaylists();
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || 'Erro ao adicionar playlist';
            toast.error(errorMsg);
        } finally {
            setSubmitting(false);
        }
    };

    const syncPlaylist = async (id) => {
        try {
            toast.loading('Sincronizando...', { id: `sync-${id}` });
            await apiHelpers.syncPlaylist(id);
            toast.success('Playlist sincronizada!', { id: `sync-${id}` });
            loadPlaylists();
        } catch (error) {
            toast.error('Erro ao sincronizar', { id: `sync-${id}` });
        }
    };

    const deletePlaylist = async (id) => {
        if (!confirm('Deseja realmente excluir esta playlist?')) return;

        try {
            await apiHelpers.deletePlaylist(id);
            toast.success('Playlist excluída');
            loadPlaylists();
        } catch (error) {
            toast.error('Erro ao excluir playlist');
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'success':
                return <HiCheck className="w-4 h-4 text-green-400" />;
            case 'error':
                return <HiExclamation className="w-4 h-4 text-red-400" />;
            case 'syncing':
                return <HiRefresh className="w-4 h-4 text-yellow-400 animate-spin" />;
            default:
                return <HiClock className="w-4 h-4 text-gray-400" />;
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
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Playlists</h1>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary"
                >
                    <HiPlus className="w-5 h-5 mr-2" />
                    Adicionar
                </button>
            </div>

            {/* Playlists Grid */}
            {playlists.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playlists.map((playlist) => (
                        <div key={playlist.id} className="card p-4">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h3 className="font-medium text-white">{playlist.name}</h3>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {playlist.channel_count} canais
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    {getStatusIcon(playlist.sync_status)}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                                {playlist.source_type === 'url' ? (
                                    <HiLink className="w-4 h-4" />
                                ) : (
                                    <HiUpload className="w-4 h-4" />
                                )}
                                <span>
                                    {playlist.source_type === 'url' ? 'URL' : 'Arquivo'}
                                </span>
                                {playlist.auto_update && (
                                    <span className="badge badge-primary">Auto-update</span>
                                )}
                            </div>

                            {playlist.last_sync_at && (
                                <p className="text-xs text-gray-500 mb-4">
                                    Última sync: {new Date(playlist.last_sync_at).toLocaleString('pt-BR')}
                                </p>
                            )}

                            <div className="flex items-center gap-2">
                                <Link
                                    to={`/playlists/${playlist.id}`}
                                    className="btn btn-secondary flex-1 text-sm"
                                >
                                    Ver canais
                                </Link>
                                {playlist.source_type === 'url' && (
                                    <button
                                        onClick={() => syncPlaylist(playlist.id)}
                                        className="btn-icon"
                                        title="Sincronizar"
                                    >
                                        <HiRefresh className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => deletePlaylist(playlist.id)}
                                    className="btn-icon text-red-400 hover:text-red-300"
                                    title="Excluir"
                                >
                                    <HiTrash className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiPlus className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhuma playlist
                    </h3>
                    <p className="text-gray-400 mb-6">
                        Adicione sua primeira playlist IPTV
                    </p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="btn btn-primary"
                    >
                        <HiPlus className="w-5 h-5 mr-2" />
                        Adicionar Playlist
                    </button>
                </div>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="card p-6 w-full max-w-md animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-6">
                            Adicionar Playlist
                        </h2>

                        {/* Type Toggle */}
                        <div className="flex gap-2 mb-6">
                            <button
                                onClick={() => setAddType('url')}
                                className={clsx(
                                    'flex-1 py-2 rounded-lg font-medium transition-colors',
                                    addType === 'url'
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-dark-800 text-gray-400'
                                )}
                            >
                                <HiLink className="w-5 h-5 inline mr-2" />
                                Por URL
                            </button>
                            <button
                                onClick={() => setAddType('file')}
                                className={clsx(
                                    'flex-1 py-2 rounded-lg font-medium transition-colors',
                                    addType === 'file'
                                        ? 'bg-primary-600 text-white'
                                        : 'bg-dark-800 text-gray-400'
                                )}
                            >
                                <HiUpload className="w-5 h-5 inline mr-2" />
                                Arquivo
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Nome da playlist
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="input"
                                    placeholder="Minha Playlist"
                                    required
                                />
                            </div>

                            {addType === 'url' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            URL da playlist (M3U/M3U8)
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.sourceUrl}
                                            onChange={(e) => setFormData(prev => ({ ...prev, sourceUrl: e.target.value }))}
                                            className="input"
                                            placeholder="https://exemplo.com/playlist.m3u"
                                            required
                                        />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="autoUpdate"
                                            checked={formData.autoUpdate}
                                            onChange={(e) => setFormData(prev => ({ ...prev, autoUpdate: e.target.checked }))}
                                            className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                                        />
                                        <label htmlFor="autoUpdate" className="text-sm text-gray-300">
                                            Atualizar automaticamente
                                        </label>
                                    </div>

                                    {formData.autoUpdate && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                                Intervalo de atualização (horas)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="168"
                                                value={formData.updateInterval}
                                                onChange={(e) => setFormData(prev => ({ ...prev, updateInterval: parseInt(e.target.value) }))}
                                                className="input"
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Arquivo M3U/M3U8
                                    </label>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".m3u,.m3u8,.txt"
                                        className="input"
                                        required
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="btn btn-secondary flex-1"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary flex-1"
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <div className="spinner w-5 h-5 border-2"></div>
                                    ) : (
                                        'Adicionar'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
