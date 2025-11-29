import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiCreditCard, HiCheck, HiX } from 'react-icons/hi';

export default function AdminPlans() {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        try {
            const response = await apiHelpers.getAdminPlans();
            setPlans(response.data.data.plans);
        } catch (error) {
            console.error('Erro ao carregar planos:', error);
        } finally {
            setLoading(false);
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
            <h1 className="text-2xl font-bold text-white">Planos</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan) => (
                    <div key={plan.id} className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                            <span className="text-2xl font-bold text-primary-400">
                                R$ {parseFloat(plan.price).toFixed(2)}
                            </span>
                        </div>

                        <p className="text-sm text-gray-400 mb-4">{plan.description}</p>

                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Playlists</span>
                                <span className="text-white">
                                    {plan.max_playlists === -1 ? 'Ilimitado' : plan.max_playlists}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">Canais</span>
                                <span className="text-white">
                                    {plan.max_channels === -1 ? 'Ilimitado' : plan.max_channels}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">EPG</span>
                                {plan.can_use_epg ? (
                                    <HiCheck className="w-5 h-5 text-green-400" />
                                ) : (
                                    <HiX className="w-5 h-5 text-red-400" />
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-400">DVR</span>
                                {plan.can_use_dvr ? (
                                    <HiCheck className="w-5 h-5 text-green-400" />
                                ) : (
                                    <HiX className="w-5 h-5 text-red-400" />
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-dark-700">
                            <p className="text-sm text-gray-500">
                                {plan.user_count || 0} usuários
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
