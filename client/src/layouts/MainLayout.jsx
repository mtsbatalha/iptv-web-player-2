import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
    HiHome, HiPlay, HiCollection, HiHeart, HiClock,
    HiCalendar, HiVideoCamera, HiCog, HiLogout,
    HiMenu, HiX, HiChevronDown, HiShieldCheck
} from 'react-icons/hi';
import clsx from 'clsx';

const navItems = [
    { to: '/', icon: HiHome, label: 'Dashboard' },
    { to: '/channels', icon: HiPlay, label: 'Canais' },
    { to: '/playlists', icon: HiCollection, label: 'Playlists' },
    { to: '/favorites', icon: HiHeart, label: 'Favoritos' },
    { to: '/history', icon: HiClock, label: 'Histórico' },
    { to: '/epg', icon: HiCalendar, label: 'Grade' },
    { to: '/recordings', icon: HiVideoCamera, label: 'Gravações' },
];

export default function MainLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/channels?search=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
        }
    };

    const isAdmin = ['admin', 'superadmin'].includes(user?.role);

    return (
        <div className="flex h-screen bg-dark-950">
            {/* Sidebar - Desktop */}
            <aside className="hidden md:flex md:flex-col md:w-64 bg-dark-900 border-r border-dark-800">
                {/* Logo */}
                <div className="flex items-center h-16 px-6 border-b border-dark-800">
                    <HiPlay className="w-8 h-8 text-primary-500" />
                    <span className="ml-2 text-xl font-bold text-white">IPTV Player</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                'sidebar-link',
                                isActive && 'active'
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}

                    {isAdmin && (
                        <>
                            <div className="my-4 border-t border-dark-800" />
                            <NavLink
                                to="/admin"
                                className={({ isActive }) => clsx(
                                    'sidebar-link',
                                    isActive && 'active'
                                )}
                            >
                                <HiShieldCheck className="w-5 h-5" />
                                <span>Admin</span>
                            </NavLink>
                        </>
                    )}
                </nav>

                {/* Settings */}
                <div className="p-3 border-t border-dark-800">
                    <NavLink
                        to="/settings"
                        className={({ isActive }) => clsx(
                            'sidebar-link',
                            isActive && 'active'
                        )}
                    >
                        <HiCog className="w-5 h-5" />
                        <span>Configurações</span>
                    </NavLink>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-dark-900 border-b border-dark-800">
                    {/* Mobile menu button */}
                    <button
                        className="md:hidden btn-icon"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
                    </button>

                    {/* Search */}
                    <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-4">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar canais..."
                            className="input"
                        />
                    </form>

                    {/* User menu */}
                    <div className="relative">
                        <button
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-800 transition-colors"
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                        >
                            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                                <span className="text-sm font-medium">
                                    {user?.firstName?.[0] || user?.username?.[0] || 'U'}
                                </span>
                            </div>
                            <span className="hidden sm:block text-sm font-medium">
                                {user?.firstName || user?.username}
                            </span>
                            <HiChevronDown className="w-4 h-4 text-gray-400" />
                        </button>

                        {userMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-lg py-1 z-50">
                                <div className="px-4 py-2 border-b border-dark-700">
                                    <p className="text-sm font-medium">{user?.username}</p>
                                    <p className="text-xs text-gray-400">{user?.email}</p>
                                    <span className="badge badge-primary mt-1">{user?.plan?.name}</span>
                                </div>
                                <NavLink
                                    to="/settings"
                                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-dark-700"
                                    onClick={() => setUserMenuOpen(false)}
                                >
                                    Configurações
                                </NavLink>
                                <button
                                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-700"
                                    onClick={handleLogout}
                                >
                                    Sair
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    <Outlet />
                </main>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={clsx(
                    'fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 transform transition-transform duration-300 md:hidden',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="flex items-center justify-between h-16 px-6 border-b border-dark-800">
                    <div className="flex items-center">
                        <HiPlay className="w-8 h-8 text-primary-500" />
                        <span className="ml-2 text-xl font-bold">IPTV Player</span>
                    </div>
                    <button onClick={() => setSidebarOpen(false)}>
                        <HiX className="w-6 h-6" />
                    </button>
                </div>

                <nav className="px-3 py-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                'sidebar-link',
                                isActive && 'active'
                            )}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Mobile Bottom Nav */}
            <nav className="mobile-nav md:hidden">
                <div className="flex justify-around">
                    {navItems.slice(0, 5).map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => clsx(
                                'mobile-nav-item',
                                isActive && 'active'
                            )}
                        >
                            <item.icon className="w-6 h-6" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>
        </div>
    );
}
