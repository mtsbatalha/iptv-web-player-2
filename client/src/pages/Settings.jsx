import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiHelpers } from '../services/api';
import { HiUser, HiLockClosed, HiCog, HiLogout } from 'react-icons/hi';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function Settings() {
    const { user, setUser, logout } = useAuthStore();
    const [activeTab, setActiveTab] = useState('profile');
    const [loading, setLoading] = useState(false);

    const [profileData, setProfileData] = useState({
        firstName: user?.firstName || '',
        lastName: user?.lastName || ''
    });

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const tabs = [
        { id: 'profile', label: 'Perfil', icon: HiUser },
        { id: 'password', label: 'Senha', icon: HiLockClosed },
        { id: 'preferences', label: 'Preferências', icon: HiCog }
    ];

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            await apiHelpers.updateProfile(profileData);
            setUser({ ...user, ...profileData });
            toast.success('Perfil atualizado');
        } catch (error) {
            toast.error('Erro ao atualizar perfil');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('As senhas não conferem');
            return;
        }

        setLoading(true);

        try {
            await apiHelpers.changePassword({
                currentPassword: passwordData.currentPassword,
                newPassword: passwordData.newPassword
            });

            toast.success('Senha alterada. Faça login novamente.');
            logout();
        } catch (error) {
            toast.error(error.response?.data?.error?.message || 'Erro ao alterar senha');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-white">Configurações</h1>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-dark-800 pb-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                            activeTab === tab.id
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-400 hover:text-white'
                        )}
                    >
                        <tab.icon className="w-5 h-5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
                <div className="card p-6">
                    <h2 className="text-lg font-semibold text-white mb-6">Informações do Perfil</h2>

                    <form onSubmit={handleProfileSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Nome
                                </label>
                                <input
                                    type="text"
                                    value={profileData.firstName}
                                    onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Sobrenome
                                </label>
                                <input
                                    type="text"
                                    value={profileData.lastName}
                                    onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                                    className="input"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Email
                            </label>
                            <input
                                type="email"
                                value={user?.email || ''}
                                className="input bg-dark-800"
                                disabled
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Username
                            </label>
                            <input
                                type="text"
                                value={user?.username || ''}
                                className="input bg-dark-800"
                                disabled
                            />
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <div className="spinner w-5 h-5 border-2"></div> : 'Salvar'}
                        </button>
                    </form>
                </div>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
                <div className="card p-6">
                    <h2 className="text-lg font-semibold text-white mb-6">Alterar Senha</h2>

                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Senha atual
                            </label>
                            <input
                                type="password"
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                                className="input"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Nova senha
                            </label>
                            <input
                                type="password"
                                value={passwordData.newPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                                className="input"
                                required
                                minLength={6}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Confirmar nova senha
                            </label>
                            <input
                                type="password"
                                value={passwordData.confirmPassword}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                className="input"
                                required
                            />
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? <div className="spinner w-5 h-5 border-2"></div> : 'Alterar Senha'}
                        </button>
                    </form>
                </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
                <div className="card p-6">
                    <h2 className="text-lg font-semibold text-white mb-6">Preferências</h2>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-dark-800 rounded-lg">
                            <div>
                                <p className="font-medium text-white">Autoplay</p>
                                <p className="text-sm text-gray-400">Reproduzir automaticamente ao abrir canal</p>
                            </div>
                            <input type="checkbox" defaultChecked className="w-5 h-5" />
                        </div>

                        <div className="flex items-center justify-between p-4 bg-dark-800 rounded-lg">
                            <div>
                                <p className="font-medium text-white">Conteúdo adulto</p>
                                <p className="text-sm text-gray-400">Mostrar canais marcados como adulto</p>
                            </div>
                            <input type="checkbox" className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            )}

            {/* Plan Info */}
            <div className="card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Seu Plano</h2>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-bold text-primary-400">{user?.plan?.name || 'Free'}</p>
                        <p className="text-sm text-gray-400 mt-1">
                            {user?.plan?.limits?.maxPlaylists === -1
                                ? 'Recursos ilimitados'
                                : `Até ${user?.plan?.limits?.maxPlaylists} playlists`}
                        </p>
                    </div>
                    <button className="btn btn-secondary">
                        Fazer Upgrade
                    </button>
                </div>
            </div>
        </div>
    );
}
