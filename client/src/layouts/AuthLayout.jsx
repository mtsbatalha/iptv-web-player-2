import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { HiPlay } from 'react-icons/hi';

export default function AuthLayout() {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-dark-950">
                <div className="spinner"></div>
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen bg-dark-950 flex">
            {/* Left side - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-900 via-dark-900 to-dark-950 p-12 flex-col justify-between">
                <div className="flex items-center">
                    <HiPlay className="w-10 h-10 text-primary-400" />
                    <span className="ml-3 text-2xl font-bold text-white">IPTV Player</span>
                </div>

                <div className="space-y-6">
                    <h1 className="text-4xl font-bold text-white">
                        Assista seus canais favoritos em qualquer lugar
                    </h1>
                    <p className="text-lg text-gray-300">
                        Gerencie suas playlists IPTV, acesse a grade de programação e grave seus programas favoritos.
                    </p>
                    <div className="flex gap-8 text-gray-300">
                        <div>
                            <div className="text-3xl font-bold text-primary-400">1000+</div>
                            <div className="text-sm">Canais</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-primary-400">EPG</div>
                            <div className="text-sm">Grade completa</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-primary-400">DVR</div>
                            <div className="text-sm">Gravações</div>
                        </div>
                    </div>
                </div>

                <div className="text-sm text-gray-500">
                    &copy; 2024 IPTV Player. Todos os direitos reservados.
                </div>
            </div>

            {/* Right side - Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
