import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiHelpers } from '../services/api';
import { HiHeart, HiPlay, HiTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function Favorites() {
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFavorites();
    }, []);

    const loadFavorites = async () => {
        try {
            const response = await apiHelpers.getFavorites();
            setFavorites(response.data.data.favorites);
        } catch (error) {
            console.error('Erro ao carregar favoritos:', error);
        } finally {
            setLoading(false);
        }
    };

    const removeFavorite = async (channelId) => {
        try {
            await apiHelpers.removeFavorite(channelId);
            toast.success('Removido dos favoritos');
            setFavorites(prev => prev.filter(f => f.channel.id !== channelId));
        } catch (error) {
            toast.error('Erro ao remover favorito');
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
            <h1 className="text-2xl font-bold text-white">Favoritos</h1>

            {favorites.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {favorites.map((fav) => (
                        <div key={fav.id} className="card p-4 relative group">
                            <button
                                onClick={() => removeFavorite(fav.channel.id)}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-dark-800/80 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-red-400 hover:text-red-300"
                            >
                                <HiTrash className="w-4 h-4" />
                            </button>

                            <Link to={`/channels/${fav.channel.id}`}>
                                <div className="aspect-square mb-3 rounded-lg bg-dark-800 flex items-center justify-center overflow-hidden">
                                    {fav.channel.logoUrl ? (
                                        <img
                                            src={fav.channel.logoUrl}
                                            alt={fav.channel.name}
                                            className="w-full h-full object-contain p-2"
                                        />
                                    ) : (
                                        <HiPlay className="w-8 h-8 text-gray-600" />
                                    )}
                                </div>
                                <h3 className="font-medium text-sm text-white line-clamp-2">
                                    {fav.channel.name}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                    {fav.channel.groupTitle}
                                </p>
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiHeart className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">
                        Nenhum favorito
                    </h3>
                    <p className="text-gray-400">
                        Adicione canais aos favoritos para acesso rápido
                    </p>
                </div>
            )}
        </div>
    );
}
