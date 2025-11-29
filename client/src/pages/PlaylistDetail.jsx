import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import { HiArrowLeft, HiPlay, HiRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function PlaylistDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [playlist, setPlaylist] = useState(null);
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlaylist();
    }, [id]);

    const loadPlaylist = async () => {
        try {
            const [playlistRes, channelsRes] = await Promise.all([
                apiHelpers.getPlaylist(id),
                apiHelpers.getChannels({ playlistId: id, limit: 100 })
            ]);

            setPlaylist(playlistRes.data.data.playlist);
            setChannels(channelsRes.data.data.channels);
        } catch (error) {
            toast.error('Erro ao carregar playlist');
        } finally {
            setLoading(false);
        }
    };

    const syncPlaylist = async () => {
        try {
            toast.loading('Sincronizando...', { id: 'sync' });
            await apiHelpers.syncPlaylist(id);
            toast.success('Sincronizado!', { id: 'sync' });
            loadPlaylist();
        } catch (error) {
            toast.error('Erro ao sincronizar', { id: 'sync' });
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
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/playlists')}
                    className="flex items-center gap-2 text-gray-400 hover:text-white"
                >
                    <HiArrowLeft className="w-5 h-5" />
                    Voltar
                </button>

                {playlist?.source_type === 'url' && (
                    <button onClick={syncPlaylist} className="btn btn-secondary">
                        <HiRefresh className="w-5 h-5 mr-2" />
                        Sincronizar
                    </button>
                )}
            </div>

            <div className="card p-6">
                <h1 className="text-2xl font-bold text-white">{playlist?.name}</h1>
                <p className="text-gray-400 mt-1">{channels.length} canais</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {channels.map((channel) => (
                    <Link
                        key={channel.id}
                        to={`/channels/${channel.id}`}
                        className="card card-hover p-4 text-center"
                    >
                        <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-dark-800 flex items-center justify-center overflow-hidden">
                            {channel.logoUrl ? (
                                <img src={channel.logoUrl} alt={channel.name} className="w-full h-full object-contain" />
                            ) : (
                                <HiPlay className="w-8 h-8 text-gray-600" />
                            )}
                        </div>
                        <p className="font-medium text-white text-sm line-clamp-2">{channel.name}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
