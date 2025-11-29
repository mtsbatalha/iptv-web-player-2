import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiSearch, HiPlus, HiPencil, HiTrash, HiKey, HiX, HiCheck, HiBan } from 'react-icons/hi';
import toast from 'react-hot-toast';
import clsx from 'clsx';

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [filters, setFilters] = useState({ role: '', status: '' });

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'user',
        planId: 1,
        status: 'active'
    });
    const [newPassword, setNewPassword] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadUsers();
        loadPlans();
    }, [pagination.page, search, filters]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const response = await apiHelpers.getAdminUsers({
                page: pagination.page,
                limit: 20,
                search: search || undefined,
                role: filters.role || undefined,
                status: filters.status || undefined
            });
            setUsers(response.data.data.users);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            toast.error('Erro ao carregar usuários');
        } finally {
            setLoading(false);
        }
    };

    const loadPlans = async () => {
        try {
            const response = await apiHelpers.getAdminPlans();
            setPlans(response.data.data.plans);
        } catch (error) {
            console.error('Erro ao carregar planos:', error);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!formData.username || !formData.email || !formData.password) {
            toast.error('Preencha todos os campos obrigatórios');
            return;
        }

        setSaving(true);
        try {
            await apiHelpers.createAdminUser(formData);
            toast.success('Usuário criado com sucesso');
            setShowCreateModal(false);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            toast.error(error.response?.data?.message || 'Erro ao criar usuário');
        } finally {
            setSaving(false);
        }
    };

    const handleEditUser = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;

        setSaving(true);
        try {
            await apiHelpers.updateAdminUser(selectedUser.id, {
                firstName: formData.firstName,
                lastName: formData.lastName,
                role: formData.role,
                planId: formData.planId,
                status: formData.status
            });
            toast.success('Usuário atualizado com sucesso');
            setShowEditModal(false);
            setSelectedUser(null);
            loadUsers();
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            toast.error(error.response?.data?.message || 'Erro ao atualizar usuário');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;

        setSaving(true);
        try {
            await apiHelpers.deleteAdminUser(selectedUser.id);
            toast.success('Usuário deletado com sucesso');
            setShowDeleteModal(false);
            setSelectedUser(null);
            loadUsers();
        } catch (error) {
            console.error('Erro ao deletar usuário:', error);
            toast.error(error.response?.data?.message || 'Erro ao deletar usuário');
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!selectedUser || !newPassword) {
            toast.error('Digite a nova senha');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        setSaving(true);
        try {
            await apiHelpers.resetUserPassword(selectedUser.id, newPassword);
            toast.success('Senha resetada com sucesso');
            setShowPasswordModal(false);
            setSelectedUser(null);
            setNewPassword('');
        } catch (error) {
            console.error('Erro ao resetar senha:', error);
            toast.error(error.response?.data?.message || 'Erro ao resetar senha');
        } finally {
            setSaving(false);
        }
    };

    const openEditModal = (user) => {
        setSelectedUser(user);
        setFormData({
            username: user.username,
            email: user.email,
            password: '',
            firstName: user.first_name || '',
            lastName: user.last_name || '',
            role: user.role,
            planId: user.plan_id || 1,
            status: user.status
        });
        setShowEditModal(true);
    };

    const openDeleteModal = (user) => {
        setSelectedUser(user);
        setShowDeleteModal(true);
    };

    const openPasswordModal = (user) => {
        setSelectedUser(user);
        setNewPassword('');
        setShowPasswordModal(true);
    };

    const resetForm = () => {
        setFormData({
            username: '',
            email: '',
            password: '',
            firstName: '',
            lastName: '',
            role: 'user',
            planId: 1,
            status: 'active'
        });
    };

    const getRoleBadge = (role) => {
        const badges = {
            superadmin: 'bg-yellow-500/20 text-yellow-400',
            admin: 'bg-blue-500/20 text-blue-400',
            moderator: 'bg-green-500/20 text-green-400',
            user: 'bg-gray-500/20 text-gray-400'
        };
        return <span className={clsx('px-2 py-1 rounded text-xs font-medium', badges[role])}>{role}</span>;
    };

    const getStatusBadge = (status) => {
        const badges = {
            active: 'bg-green-500/20 text-green-400',
            inactive: 'bg-yellow-500/20 text-yellow-400',
            suspended: 'bg-red-500/20 text-red-400',
            pending: 'bg-gray-500/20 text-gray-400'
        };
        return <span className={clsx('px-2 py-1 rounded text-xs font-medium', badges[status])}>{status}</span>;
    };

    const generatePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Usuários</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        {pagination.total} usuários cadastrados
                    </p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setShowCreateModal(true);
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <HiPlus className="w-5 h-5" />
                    Novo Usuário
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="input pl-10 w-full"
                        placeholder="Buscar por nome, email ou username..."
                    />
                </div>
                <select
                    value={filters.role}
                    onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                    className="input w-40"
                >
                    <option value="">Todos os roles</option>
                    <option value="user">User</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                </select>
                <select
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="input w-40"
                >
                    <option value="">Todos os status</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="suspended">Suspenso</option>
                    <option value="pending">Pendente</option>
                </select>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="spinner"></div>
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <p>Nenhum usuário encontrado</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-dark-800">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Usuário</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Email</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Role</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Plano</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Status</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Playlists</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Último Login</th>
                                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-800">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-dark-800/50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-sm font-medium text-white">
                                                        {(user.first_name?.[0] || user.username[0]).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white">{user.username}</p>
                                                    {(user.first_name || user.last_name) && (
                                                        <p className="text-xs text-gray-500">
                                                            {user.first_name} {user.last_name}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-300">{user.email}</td>
                                        <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-300">{user.plan_name || '-'}</td>
                                        <td className="px-4 py-3">{getStatusBadge(user.status)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-300">{user.playlist_count || 0}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {user.last_login_at
                                                ? new Date(user.last_login_at).toLocaleDateString('pt-BR')
                                                : 'Nunca'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <HiPencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openPasswordModal(user)}
                                                    className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-dark-700 rounded-lg transition-colors"
                                                    title="Resetar Senha"
                                                >
                                                    <HiKey className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => openDeleteModal(user)}
                                                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
                                                    title="Deletar"
                                                >
                                                    <HiTrash className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                    <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                        disabled={pagination.page === 1}
                        className="px-4 py-2 rounded-lg bg-dark-800 text-gray-400 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Anterior
                    </button>
                    <span className="px-4 py-2 text-gray-400">
                        Página {pagination.page} de {pagination.totalPages}
                    </span>
                    <button
                        onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                        disabled={pagination.page === pagination.totalPages}
                        className="px-4 py-2 rounded-lg bg-dark-800 text-gray-400 hover:bg-dark-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Próxima
                    </button>
                </div>
            )}

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-900 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b border-dark-800">
                            <h2 className="text-lg font-semibold text-white">Novo Usuário</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg"
                            >
                                <HiX className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateUser} className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Username *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                        className="input w-full"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Email *
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        className="input w-full"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Senha *
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={formData.password}
                                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        className="input flex-1"
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, password: generatePassword() }))}
                                        className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                    >
                                        Gerar
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Nome
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                        className="input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Sobrenome
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                        className="input w-full"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Role
                                    </label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                                        className="input w-full"
                                    >
                                        <option value="user">User</option>
                                        <option value="moderator">Moderator</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Plano
                                    </label>
                                    <select
                                        value={formData.planId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, planId: parseInt(e.target.value) }))}
                                        className="input w-full"
                                    >
                                        {plans.map(plan => (
                                            <option key={plan.id} value={plan.id}>{plan.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                        className="input w-full"
                                    >
                                        <option value="active">Ativo</option>
                                        <option value="inactive">Inativo</option>
                                        <option value="pending">Pendente</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn btn-primary"
                                >
                                    {saving ? 'Criando...' : 'Criar Usuário'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-900 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b border-dark-800">
                            <h2 className="text-lg font-semibold text-white">Editar Usuário</h2>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg"
                            >
                                <HiX className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleEditUser} className="p-4 space-y-4">
                            <div className="bg-dark-800 rounded-lg p-3">
                                <p className="text-sm text-gray-400">Username</p>
                                <p className="text-white font-medium">{selectedUser.username}</p>
                                <p className="text-sm text-gray-500 mt-1">{selectedUser.email}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Nome
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                        className="input w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Sobrenome
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                        className="input w-full"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Role
                                    </label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                                        className="input w-full"
                                    >
                                        <option value="user">User</option>
                                        <option value="moderator">Moderator</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Plano
                                    </label>
                                    <select
                                        value={formData.planId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, planId: parseInt(e.target.value) }))}
                                        className="input w-full"
                                    >
                                        {plans.map(plan => (
                                            <option key={plan.id} value={plan.id}>{plan.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">
                                        Status
                                    </label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                                        className="input w-full"
                                    >
                                        <option value="active">Ativo</option>
                                        <option value="inactive">Inativo</option>
                                        <option value="suspended">Suspenso</option>
                                        <option value="pending">Pendente</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn btn-primary"
                                >
                                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete User Modal */}
            {showDeleteModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-900 rounded-xl w-full max-w-md">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                                <HiTrash className="w-8 h-8 text-red-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">Deletar Usuário</h2>
                            <p className="text-gray-400 mb-6">
                                Tem certeza que deseja deletar o usuário <strong className="text-white">{selectedUser.username}</strong>?
                                Esta ação não pode ser desfeita.
                            </p>
                            <div className="flex justify-center gap-3">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={saving}
                                    className="btn bg-red-600 text-white hover:bg-red-700"
                                >
                                    {saving ? 'Deletando...' : 'Deletar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showPasswordModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-900 rounded-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-4 border-b border-dark-800">
                            <h2 className="text-lg font-semibold text-white">Resetar Senha</h2>
                            <button
                                onClick={() => setShowPasswordModal(false)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg"
                            >
                                <HiX className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleResetPassword} className="p-4 space-y-4">
                            <div className="bg-dark-800 rounded-lg p-3">
                                <p className="text-sm text-gray-400">Usuário</p>
                                <p className="text-white font-medium">{selectedUser.username}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    Nova Senha
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input flex-1"
                                        required
                                        minLength={6}
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setNewPassword(generatePassword())}
                                        className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                    >
                                        Gerar
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(false)}
                                    className="btn bg-dark-700 text-gray-300 hover:bg-dark-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn btn-primary"
                                >
                                    {saving ? 'Resetando...' : 'Resetar Senha'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
