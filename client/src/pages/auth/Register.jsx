import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { HiPlay, HiMail, HiLockClosed, HiUser, HiEye, HiEyeOff } from 'react-icons/hi';

export default function Register() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const { register } = useAuthStore();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.username || !formData.email || !formData.password) {
            toast.error('Preencha todos os campos obrigatórios');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            toast.error('As senhas não conferem');
            return;
        }

        if (formData.password.length < 6) {
            toast.error('A senha deve ter no mínimo 6 caracteres');
            return;
        }

        setLoading(true);

        try {
            await register({
                username: formData.username,
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                lastName: formData.lastName
            });

            toast.success('Conta criada com sucesso!');
            navigate('/');
        } catch (error) {
            const message = error.response?.data?.error?.message || 'Erro ao criar conta';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Logo mobile */}
            <div className="flex items-center justify-center mb-8 lg:hidden">
                <HiPlay className="w-10 h-10 text-primary-500" />
                <span className="ml-2 text-2xl font-bold">IPTV Player</span>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Criar conta</h2>
            <p className="text-gray-400 mb-8">Preencha os dados para se cadastrar</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Nome
                        </label>
                        <input
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            className="input"
                            placeholder="Seu nome"
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Sobrenome
                        </label>
                        <input
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            className="input"
                            placeholder="Seu sobrenome"
                            disabled={loading}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Username *
                    </label>
                    <div className="relative">
                        <HiUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            className="input pl-10"
                            placeholder="Escolha um username"
                            disabled={loading}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Email *
                    </label>
                    <div className="relative">
                        <HiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className="input pl-10"
                            placeholder="seu@email.com"
                            disabled={loading}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Senha *
                    </label>
                    <div className="relative">
                        <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="input pl-10 pr-10"
                            placeholder="Mínimo 6 caracteres"
                            disabled={loading}
                            required
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Confirmar Senha *
                    </label>
                    <div className="relative">
                        <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className="input pl-10"
                            placeholder="Repita a senha"
                            disabled={loading}
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="btn btn-primary w-full py-3 mt-6"
                    disabled={loading}
                >
                    {loading ? (
                        <div className="spinner w-5 h-5 border-2"></div>
                    ) : (
                        'Criar Conta'
                    )}
                </button>
            </form>

            <p className="mt-6 text-center text-gray-400">
                Já tem uma conta?{' '}
                <Link to="/login" className="text-primary-400 hover:text-primary-300">
                    Entrar
                </Link>
            </p>
        </div>
    );
}
