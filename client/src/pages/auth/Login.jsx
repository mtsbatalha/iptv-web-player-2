import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { HiPlay, HiMail, HiLockClosed, HiEye, HiEyeOff } from 'react-icons/hi';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const { login } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error('Preencha todos os campos');
            return;
        }

        setLoading(true);

        try {
            await login(email, password);
            toast.success('Login realizado com sucesso!');
            navigate('/');
        } catch (error) {
            const message = error.response?.data?.error?.message || 'Erro ao fazer login';
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

            <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo de volta</h2>
            <p className="text-gray-400 mb-8">Entre com sua conta para continuar</p>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Email
                    </label>
                    <div className="relative">
                        <HiMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input pl-10"
                            placeholder="seu@email.com"
                            disabled={loading}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Senha
                    </label>
                    <div className="relative">
                        <HiLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input pl-10 pr-10"
                            placeholder="Sua senha"
                            disabled={loading}
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

                <button
                    type="submit"
                    className="btn btn-primary w-full py-3"
                    disabled={loading}
                >
                    {loading ? (
                        <div className="spinner w-5 h-5 border-2"></div>
                    ) : (
                        'Entrar'
                    )}
                </button>
            </form>

            <p className="mt-6 text-center text-gray-400">
                Não tem uma conta?{' '}
                <Link to="/register" className="text-primary-400 hover:text-primary-300">
                    Cadastre-se
                </Link>
            </p>

            {/* Demo credentials */}
            <div className="mt-8 p-4 bg-dark-800/50 rounded-lg border border-dark-700">
                <p className="text-sm text-gray-400 mb-2">Credenciais de demonstração:</p>
                <p className="text-xs text-gray-500">Admin: admin@iptv.local / admin123</p>
                <p className="text-xs text-gray-500">Usuário: user@iptv.local / user123</p>
            </div>
        </div>
    );
}
