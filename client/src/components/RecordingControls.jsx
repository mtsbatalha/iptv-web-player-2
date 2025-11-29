import { useState } from 'react';
import { useRecording } from '../hooks/useRecording';
import { apiHelpers } from '../services/api';
import { HiStop, HiCalendar, HiX } from 'react-icons/hi';
import { FaCircle } from 'react-icons/fa';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function RecordingControls({ channelId, channelName, compact = false }) {
    const {
        isRecording,
        formattedTime,
        loading,
        startRecording,
        stopRecording
    } = useRecording(channelId);

    const [showScheduleModal, setShowScheduleModal] = useState(false);

    const handleStartRecording = async () => {
        const result = await startRecording(channelName);
        if (result.success) {
            toast.success('Gravação iniciada!');
        } else {
            toast.error(result.error);
        }
    };

    const handleStopRecording = async () => {
        const result = await stopRecording();
        if (result.success) {
            toast.success('Gravação finalizada!');
        } else {
            toast.error(result.error);
        }
    };

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                {isRecording ? (
                    <button
                        onClick={handleStopRecording}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium hover:bg-red-500/30 transition-colors"
                    >
                        <FaCircle className="w-2 h-2 animate-pulse" />
                        <span>{formattedTime}</span>
                        <HiStop className="w-3 h-3" />
                    </button>
                ) : (
                    <button
                        onClick={handleStartRecording}
                        disabled={loading}
                        className="flex items-center gap-1 px-2 py-1 bg-dark-700 text-gray-300 rounded text-xs hover:bg-dark-600 transition-colors"
                    >
                        <FaCircle className="w-2 h-2 text-red-500" />
                        <span>REC</span>
                    </button>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="flex items-center gap-2">
                {isRecording ? (
                    <>
                        {/* Recording indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg">
                            <FaCircle className="w-2.5 h-2.5 text-red-500 animate-pulse" />
                            <span className="text-red-400 text-sm font-medium">
                                REC {formattedTime}
                            </span>
                        </div>

                        {/* Stop button */}
                        <button
                            onClick={handleStopRecording}
                            disabled={loading}
                            className={clsx(
                                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                'bg-red-500 text-white hover:bg-red-600',
                                loading && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <HiStop className="w-4 h-4" />
                            Parar
                        </button>
                    </>
                ) : (
                    <>
                        {/* Start recording button */}
                        <button
                            onClick={handleStartRecording}
                            disabled={loading}
                            className={clsx(
                                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                'bg-dark-700 text-gray-300 hover:bg-dark-600',
                                loading && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            <FaCircle className="w-3 h-3 text-red-500" />
                            Gravar
                        </button>

                        {/* Schedule recording button */}
                        <button
                            onClick={() => setShowScheduleModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-dark-700 text-gray-300 hover:bg-dark-600 transition-colors"
                        >
                            <HiCalendar className="w-4 h-4" />
                            Agendar
                        </button>
                    </>
                )}
            </div>

            {/* Schedule Modal */}
            {showScheduleModal && (
                <ScheduleModal
                    channelId={channelId}
                    channelName={channelName}
                    onClose={() => setShowScheduleModal(false)}
                    onScheduled={() => {
                        setShowScheduleModal(false);
                        toast.success('Gravação agendada!');
                    }}
                />
            )}
        </>
    );
}

// Recording indicator for top of player
export function RecordingIndicator({ channelId }) {
    const { isRecording, formattedTime, stopRecording, loading } = useRecording(channelId);

    if (!isRecording) return null;

    const handleStop = async () => {
        const result = await stopRecording();
        if (result.success) {
            toast.success('Gravação finalizada!');
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-600/90 backdrop-blur-sm rounded-lg shadow-lg">
                <FaCircle className="w-3 h-3 text-white animate-pulse" />
                <span className="text-white text-sm font-bold tracking-wider">
                    REC
                </span>
                <span className="text-white/90 text-sm font-mono">
                    {formattedTime}
                </span>
            </div>
            <button
                onClick={handleStop}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-black/70 backdrop-blur-sm text-white rounded-lg hover:bg-black/80 transition-colors"
            >
                <HiStop className="w-4 h-4" />
                <span className="text-sm">Parar</span>
            </button>
        </div>
    );
}

// Schedule Recording Modal
function ScheduleModal({ channelId, channelName, onClose, onScheduled }) {
    const [formData, setFormData] = useState({
        title: `${channelName} - Gravação agendada`,
        startDate: '',
        startTime: '',
        duration: 60
    });
    const [loading, setLoading] = useState(false);

    // Set default date/time to now + 5 minutes
    useState(() => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);

        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().slice(0, 5);

        setFormData(prev => ({
            ...prev,
            startDate: dateStr,
            startTime: timeStr
        }));
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const scheduledStart = new Date(`${formData.startDate}T${formData.startTime}`);

            await apiHelpers.scheduleRecording({
                channelId: parseInt(channelId),
                title: formData.title,
                scheduledStart: scheduledStart.toISOString(),
                duration: parseInt(formData.duration)
            });

            onScheduled();
        } catch (error) {
            toast.error(error.response?.data?.error?.message || 'Erro ao agendar gravação');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Agendar Gravação</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                        <HiX className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Título</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="input w-full"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Data</label>
                            <input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="input w-full"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Hora</label>
                            <input
                                type="time"
                                value={formData.startTime}
                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                className="input w-full"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Duração (minutos)</label>
                        <select
                            value={formData.duration}
                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                            className="input w-full"
                        >
                            <option value="15">15 minutos</option>
                            <option value="30">30 minutos</option>
                            <option value="60">1 hora</option>
                            <option value="90">1h 30min</option>
                            <option value="120">2 horas</option>
                            <option value="180">3 horas</option>
                            <option value="240">4 horas</option>
                        </select>
                    </div>

                    <div className="p-3 bg-dark-700 rounded-lg">
                        <p className="text-sm text-gray-400">Canal</p>
                        <p className="text-white font-medium">{channelName}</p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={clsx(
                                'flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors',
                                loading && 'opacity-50 cursor-not-allowed'
                            )}
                        >
                            {loading ? 'Agendando...' : 'Agendar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
