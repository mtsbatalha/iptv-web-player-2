import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
    HiChartBar, HiUsers, HiCreditCard, HiCalendar,
    HiDocumentText, HiCog, HiArrowLeft, HiShieldCheck
} from 'react-icons/hi';
import clsx from 'clsx';

const adminNavItems = [
    { to: '/admin', icon: HiChartBar, label: 'Dashboard', end: true },
    { to: '/admin/users', icon: HiUsers, label: 'Usuários' },
    { to: '/admin/plans', icon: HiCreditCard, label: 'Planos' },
    { to: '/admin/epg', icon: HiCalendar, label: 'EPG' },
    { to: '/admin/logs', icon: HiDocumentText, label: 'Logs' },
    { to: '/admin/settings', icon: HiCog, label: 'Configurações' },
];

export default function AdminLayout() {
    const { user } = useAuthStore();
    const navigate = useNavigate();

    return (
        <div className="flex h-screen bg-dark-950">
            {/* Sidebar */}
            <aside className="w-64 bg-dark-900 border-r border-dark-800 flex flex-col">
                {/* Header */}
                <div className="flex items-center h-16 px-6 border-b border-dark-800">
                    <HiShieldCheck className="w-8 h-8 text-yellow-500" />
                    <span className="ml-2 text-xl font-bold text-white">Admin</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                    {adminNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => clsx(
                                'sidebar-link',
                                isActive && 'active'
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Back to app */}
                <div className="p-3 border-t border-dark-800">
                    <button
                        onClick={() => navigate('/')}
                        className="sidebar-link w-full"
                    >
                        <HiArrowLeft className="w-5 h-5" />
                        <span>Voltar ao App</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between h-16 px-6 bg-dark-900 border-b border-dark-800">
                    <h1 className="text-lg font-semibold">Painel Administrativo</h1>

                    <div className="flex items-center gap-4">
                        <span className="badge badge-warning">
                            {user?.role === 'superadmin' ? 'Super Admin' : 'Admin'}
                        </span>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center">
                                <span className="text-sm font-medium">
                                    {user?.firstName?.[0] || user?.username?.[0]}
                                </span>
                            </div>
                            <span className="text-sm">{user?.username}</span>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
