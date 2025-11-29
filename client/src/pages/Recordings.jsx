import { useState, useEffect, useMemo } from 'react';
import { apiHelpers } from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import { HiVideoCamera, HiPlay, HiTrash, HiClock, HiCheck, HiExclamation, HiStop, HiX } from 'react-icons/hi';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function Recordings() {
    const [recordings, setRecordings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [playerOpen, setPlayerOpen] = useState(false);
    const [selectedRecording, setSelectedRecording] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    // Get deletable recordings (not currently recording or scheduled)
    const deletableRecordings = useMemo(() =>
        recordings.filter(r => ['completed', 'failed', 'cancelled'].includes(r.status)),
        [recordings]
    );

    const allDeletableSelected = deletableRecordings.length > 0 &&
        deletableRecordings.every(r => selectedIds.has(r.id));

    useEffect(() => {
        loadRecordings();
        setSelectedIds(new Set()); // Clear selection when filter changes
    }, [filter]);

    // Close player on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && playerOpen) {
                closePlayer();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [playerOpen]);

    const loadRecordings = async () => {
        try {
            const params = filter !== 'all' ? { status: filter } : {};
            const response = await apiHelpers.getRecordings(params);
            setRecordings(response.data.data.recordings);
        } catch (error) {
            console.error('Erro ao carregar gravações:', error);
        } finally {
            setLoading(false);
        }
    };

    const stopRecording = async (id) => {
        try {
            await apiHelpers.stopRecording(id);
            toast.success('Gravação finalizada');
            loadRecordings();
        } catch (error) {
            toast.error('Erro ao parar gravação');
        }
    };

    const cancelRecording = async (id) => {
        try {
            await apiHelpers.cancelRecording(id);
            toast.success('Gravação cancelada');
            loadRecordings();
        } catch (error) {
            toast.error('Erro ao cancelar');
        }
    };

    const deleteRecording = async (id) => {
        if (!confirm('Deseja excluir esta gravação?')) return;

        try {
            await apiHelpers.deleteRecording(id);
            toast.success('Gravação excluída');
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            loadRecordings();
        } catch (error) {
            toast.error('Erro ao excluir');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allDeletableSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(deletableRecordings.map(r => r.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Deseja excluir ${selectedIds.size} gravação(ões)?`)) return;

        setIsDeleting(true);
        try {
            await apiHelpers.deleteRecordings([...selectedIds]);
            toast.success(`${selectedIds.size} gravação(ões) excluída(s)`);
            setSelectedIds(new Set());
            loadRecordings();
        } catch (error) {
            toast.error('Erro ao excluir gravações');
        } finally {
            setIsDeleting(false);
        }
    };

    const watchRecording = async (recording) => {
        try {
            // Fetch full recording details to get file_path
            const response = await apiHelpers.getRecording(recording.id);
            const fullRecording = response.data.data.recording;

            if (!fullRecording.file_path) {
                toast.error('Arquivo de gravação não disponível');
                return;
            }

            setSelectedRecording({
                ...recording,
                streamUrl: `/recordings/${fullRecording.file_path}`
            });
            setPlayerOpen(true);
        } catch (error) {
            toast.error('Erro ao carregar gravação');
        }
    };

    const closePlayer = () => {
        setPlayerOpen(false);
        setSelectedRecording(null);
    };

    const getStatusBadge = (status) => {
        const badges = {
            scheduled: { class: 'badge-warning', icon: HiClock, text: 'Agendada' },
            recording: { class: 'badge-danger', icon: HiVideoCamera, text: 'Gravando' },
            completed: { class: 'badge-success', icon: HiCheck, text: 'Concluída' },
            failed: { class: 'badge-danger', icon: HiExclamation, text: 'Falhou' },
            cancelled: { class: '', icon: null, text: 'Cancelada' }
        };

        const badge = badges[status] || badges.cancelled;

        return (
            <span className={clsx('badge', badge.class)}>
                {badge.icon && <badge.icon className="w-3 h-3 mr-1" />}
                {badge.text}
            </span>
        );
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const formatSize = (bytes) => {
        if (!bytes) return '-';
        const mb = bytes / (1024 * 1024);
        return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
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
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Gravações</h1>

                {/* Bulk actions */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                            {selectedIds.size} selecionada(s)
                        </span>
                        <button
                            onClick={deleteSelected}
                            disabled={isDeleting}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors',
                                isDeleting && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <HiTrash className="w-4 h-4" />
                            {isDeleting ? 'Excluindo...' : 'Excluir selecionadas'}
                        </button>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {['all', 'scheduled', 'recording', 'completed', 'failed'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={clsx(
                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                filter === f
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-dark-800 text-gray-400 hover:text-white'
                            )}
                        >
                            {f === 'all' ? 'Todas' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Select all checkbox */}
                {deletableRecordings.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={allDeletableSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-900"
                        />
                        Selecionar todas
                    </label>
                )}
            </div>

            {recordings.length > 0 ? (
                <div className="space-y-3">
                    {recordings.map((rec) => {
                        const isDeletable = ['completed', 'failed', 'cancelled'].includes(rec.status);
                        const isSelected = selectedIds.has(rec.id);

                        return (
                        <div
                            key={rec.id}
                            className={clsx(
                                'card p-4 transition-colors',
                                isSelected && 'ring-2 ring-primary-500 bg-primary-500/5'
                            )}
                        >
                            <div className="flex items-center gap-4">
                                {/* Checkbox for deletable recordings */}
                                {isDeletable ? (
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleSelect(rec.id)}
                                        className="w-5 h-5 rounded border-gray-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-900 cursor-pointer flex-shrink-0"
                                    />
                                ) : (
                                    <div className="w-5 h-5 flex-shrink-0" />
                                )}

                                {/* Channel logo */}
                                <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {rec.channel.logoUrl ? (
                                        <img
                                            src={rec.channel.logoUrl}
                                            alt={rec.channel.name}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <HiVideoCamera className="w-6 h-6 text-gray-600" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium text-white truncate">
                                            {rec.title}
                                        </h3>
                                        {getStatusBadge(rec.status)}
                                    </div>
                                    <p className="text-sm text-gray-400 mt-1">
                                        {rec.channel.name}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                                        <span>{formatDate(rec.startTime)}</span>
                                        <span>{formatDuration(rec.duration)}</span>
                                        <span>{formatSize(rec.fileSize)}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    {rec.status === 'completed' && (
                                        <button
                                            onClick={() => watchRecording(rec)}
                                            className="btn btn-primary text-sm"
                                        >
                                            <HiPlay className="w-4 h-4 mr-1" />
                                            Assistir
                                        </button>
                                    )}
                                    {rec.status === 'recording' && (
                                        <button
                                            onClick={() => stopRecording(rec.id)}
                                            className="btn btn-danger text-sm"
                                        >
                                            <HiStop className="w-4 h-4 mr-1" />
                                            Parar
                                        </button>
                                    )}
                                    {rec.status === 'scheduled' && (
                                        <button
                                            onClick={() => cancelRecording(rec.id)}
                                            className="btn btn-secondary text-sm"
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                    {['completed', 'failed', 'cancelled'].includes(rec.status) && (
                                        <button
                                            onClick={() => deleteRecording(rec.id)}
                                            className="btn-icon text-red-400"
                                        >
                                            <HiTrash className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiVideoCamera className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhuma gravação
                    </h3>
                    <p className="text-gray-400">
                        Grave seus programas favoritos para assistir depois
                    </p>
                </div>
            )}

            {/* Player Modal */}
            {playerOpen && selectedRecording && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                    <div className="relative w-full max-w-4xl mx-4">
                        {/* Close button */}
                        <button
                            onClick={closePlayer}
                            className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
                        >
                            <HiX className="w-8 h-8" />
                        </button>

                        {/* Player */}
                        <div className="bg-black rounded-xl overflow-hidden shadow-2xl">
                            <div className="aspect-video">
                                <VideoPlayer
                                    src={selectedRecording.streamUrl}
                                    title={selectedRecording.title}
                                    autoPlay
                                    className="w-full h-full"
                                />
                            </div>
                        </div>

                        {/* Recording info */}
                        <div className="mt-4 text-white">
                            <h2 className="text-xl font-semibold">{selectedRecording.title}</h2>
                            <p className="text-gray-400 text-sm mt-1">
                                {selectedRecording.channel?.name} • {formatDate(selectedRecording.startTime)} • {formatDuration(selectedRecording.duration)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
