import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import { HiCalendar, HiPlay, HiChevronLeft, HiChevronRight, HiChevronDoubleLeft, HiChevronDoubleRight, HiCog } from 'react-icons/hi';
import clsx from 'clsx';

const CHANNELS_PER_PAGE = 15;

export default function EPG() {
    const [searchParams] = useSearchParams();
    const channelId = searchParams.get('channel');

    const [channels, setChannels] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [loadingEpg, setLoadingEpg] = useState(false);
    const [epgData, setEpgData] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [totalChannels, setTotalChannels] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // Load channels with server-side pagination
    useEffect(() => {
        loadChannels();
    }, [channelId, currentPage]);

    // Load EPG data when channels or date changes
    useEffect(() => {
        if (channels.length > 0) {
            loadEPGData();
        }
    }, [channels, selectedDate]);

    const loadChannels = async () => {
        setLoading(true);
        try {
            if (channelId) {
                // Load specific channel
                const response = await apiHelpers.getChannel(channelId);
                setChannels([response.data.data.channel]);
                setTotalChannels(1);
                setTotalPages(1);
            } else {
                // Load channels with server-side pagination
                const response = await apiHelpers.getChannels({
                    limit: CHANNELS_PER_PAGE,
                    page: currentPage,
                    streamType: 'live'
                });
                const { channels: batch, pagination } = response.data.data;
                setChannels(batch);
                setTotalChannels(pagination.total);
                setTotalPages(pagination.totalPages);
            }
        } catch (error) {
            console.error('Erro ao carregar canais:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadEPGData = async () => {
        setLoadingEpg(true);
        const data = {};

        // Load EPG for currently displayed channels
        const promises = channels.map(async (channel) => {
            try {
                const response = await apiHelpers.getChannelGuide(channel.id, selectedDate);
                data[channel.id] = response.data.data.programs;
            } catch (error) {
                data[channel.id] = [];
            }
        });

        await Promise.all(promises);
        setEpgData(data);
        setLoadingEpg(false);
    };

    // Clear EPG cache and reset page when date changes
    useEffect(() => {
        setEpgData({});
    }, [selectedDate]);

    // Reset to page 1 when switching between specific channel and all channels
    useEffect(() => {
        setCurrentPage(1);
    }, [channelId]);

    const changeDate = (days) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    const formatTime = (dateStr) => {
        return new Date(dateStr).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const isCurrentProgram = (program) => {
        const now = Date.now();
        const start = new Date(program.start_time).getTime();
        const end = new Date(program.end_time).getTime();
        return start <= now && end > now;
    };

    // Show full loading only on initial load
    if (loading && channels.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    {channelId && (
                        <Link to="/epg" className="btn-icon">
                            <HiChevronLeft className="w-5 h-5" />
                        </Link>
                    )}
                    <h1 className="text-2xl font-bold text-white">
                        {channelId && channels[0]
                            ? `Programação: ${channels[0].name}`
                            : 'Grade de Programação'}
                    </h1>
                    {!channelId && totalChannels > 0 && (
                        <span className="text-sm text-gray-400">
                            ({totalChannels.toLocaleString('pt-BR')} canais)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => changeDate(-1)} className="btn-icon" title="Dia anterior">
                        <HiChevronLeft className="w-5 h-5" />
                    </button>

                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="input w-auto"
                    />

                    <button onClick={() => changeDate(1)} className="btn-icon" title="Próximo dia">
                        <HiChevronRight className="w-5 h-5" />
                    </button>

                    <Link to="/epg/settings" className="btn-secondary ml-2" title="Configurar fontes de EPG">
                        <HiCog className="w-5 h-5" />
                        <span className="hidden sm:inline">Fontes</span>
                    </Link>
                </div>
            </div>

            {/* Channel pagination */}
            {!channelId && totalPages > 1 && (
                <div className="flex items-center justify-between bg-dark-800 rounded-lg p-3">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className={clsx(
                            'btn-icon',
                            currentPage === 1 && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Primeira página"
                    >
                        <HiChevronDoubleLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={clsx(
                            'btn-icon',
                            currentPage === 1 && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Página anterior"
                    >
                        <HiChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Página</span>
                        <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                                const page = parseInt(e.target.value) || 1;
                                setCurrentPage(Math.min(Math.max(1, page), totalPages));
                            }}
                            className="input w-20 text-center py-1"
                        />
                        <span className="text-gray-400 text-sm">de {totalPages.toLocaleString('pt-BR')}</span>
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={clsx(
                            'btn-icon',
                            currentPage === totalPages && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Próxima página"
                    >
                        <HiChevronRight className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        className={clsx(
                            'btn-icon',
                            currentPage === totalPages && 'opacity-50 cursor-not-allowed'
                        )}
                        title="Última página"
                    >
                        <HiChevronDoubleRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            <div className="card overflow-hidden relative">
                {/* Loading overlay for page navigation */}
                {loading && channels.length > 0 && (
                    <div className="absolute inset-0 bg-dark-900/70 flex items-center justify-center z-10">
                        <div className="spinner"></div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <tbody>
                            {channels.map((channel) => (
                                <tr key={channel.id} className="border-b border-dark-800">
                                    <td className="p-3 w-48 sticky left-0 bg-dark-900">
                                        <Link
                                            to={`/channels/${channel.id}`}
                                            className="flex items-center gap-3 hover:text-primary-400"
                                        >
                                            <div className="w-10 h-10 rounded bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {channel.logoUrl ? (
                                                    <img
                                                        src={channel.logoUrl}
                                                        alt={channel.name}
                                                        className="w-full h-full object-contain"
                                                    />
                                                ) : (
                                                    <HiPlay className="w-5 h-5 text-gray-600" />
                                                )}
                                            </div>
                                            <span className="text-sm font-medium truncate">
                                                {channel.name}
                                            </span>
                                        </Link>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex gap-2 min-w-max">
                                            {loadingEpg && epgData[channel.id] === undefined ? (
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <div className="w-4 h-4 border-2 border-gray-600 border-t-primary-500 rounded-full animate-spin" />
                                                    <span className="text-sm">Carregando...</span>
                                                </div>
                                            ) : epgData[channel.id]?.length > 0 ? (
                                                epgData[channel.id].map((program, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={clsx(
                                                            'epg-program min-w-[150px] max-w-[200px]',
                                                            isCurrentProgram(program) && 'current'
                                                        )}
                                                    >
                                                        <p className="text-xs text-gray-400">
                                                            {formatTime(program.start_time)} - {formatTime(program.end_time)}
                                                        </p>
                                                        <p className="font-medium text-sm truncate mt-1">
                                                            {program.title}
                                                        </p>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-500">
                                                    EPG não disponível
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom pagination */}
            {!channelId && totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 bg-dark-800 rounded-lg p-3">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            currentPage === 1
                                ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
                                : 'bg-dark-700 text-white hover:bg-dark-600'
                        )}
                    >
                        <HiChevronLeft className="w-4 h-4" />
                        Anterior
                    </button>

                    <span className="text-gray-400 text-sm">
                        Página {currentPage} de {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            currentPage === totalPages
                                ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
                                : 'bg-dark-700 text-white hover:bg-dark-600'
                        )}
                    >
                        Próxima
                        <HiChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {channels.length === 0 && (
                <div className="card p-12 text-center">
                    <HiCalendar className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhum canal
                    </h3>
                    <p className="text-gray-400">
                        Adicione playlists com canais para ver a grade
                    </p>
                </div>
            )}
        </div>
    );
}
