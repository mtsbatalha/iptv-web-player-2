import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiSearch, HiDotsVertical, HiCheck, HiBan } from 'react-icons/hi';
import clsx from 'clsx';

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });

    useEffect(() => {
        loadUsers();
    }, [pagination.page, search]);

    const loadUsers = async () => {
        try {
            const response = await apiHelpers.getAdminUsers({
                page: pagination.page,
                search: search || undefined
            });
            setUsers(response.data.data.users);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
        } finally {
            setLoading(false);
        }
    };

    const getRoleBadge = (role) => {
        const badges = {
            superadmin: 'badge-warning',
            admin: 'badge-primary',
            moderator: 'badge-success',
            user: ''
        };
        return <span className={clsx('badge', badges[role])}>{role}</span>;
    };

    const getStatusBadge = (status) => {
        const badges = {
            active: 'badge-success',
            inactive: 'badge-warning',
            suspended: 'badge-danger',
            pending: ''
        };
        return <span className={clsx('badge', badges[status])}>{status}</span>;
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
                <h1 className="text-2xl font-bold text-white">Usuários</h1>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input pl-10"
                    placeholder="Buscar usuários..."
                />
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-dark-800">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Usuário</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Email</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Role</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Plano</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Playlists</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-dark-800/50">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                                            <span className="text-sm font-medium">
                                                {user.first_name?.[0] || user.username[0]}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">{user.username}</p>
                                            <p className="text-xs text-gray-500">
                                                {user.first_name} {user.last_name}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-300">{user.email}</td>
                                <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                                <td className="px-4 py-3 text-sm text-gray-300">{user.plan_name}</td>
                                <td className="px-4 py-3">{getStatusBadge(user.status)}</td>
                                <td className="px-4 py-3 text-sm text-gray-300">{user.playlist_count}</td>
                                <td className="px-4 py-3">
                                    <button className="btn-icon">
                                        <HiDotsVertical className="w-5 h-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    {Array.from({ length: pagination.totalPages }, (_, i) => (
                        <button
                            key={i + 1}
                            onClick={() => setPagination(prev => ({ ...prev, page: i + 1 }))}
                            className={clsx(
                                'w-10 h-10 rounded-lg',
                                pagination.page === i + 1
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                            )}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
