import { useState, useEffect } from 'react';
import api from '../../services/api';
import { HiCog, HiSave } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function AdminSettings() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await api.get('/settings');
            setSettings(response.data.data.settings);
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = async (key, value) => {
        setSaving(true);
        try {
            await api.put(`/settings/${key}`, { value });
            toast.success('Configuração atualizada');
            setSettings(prev => ({
                ...prev,
                [key]: { ...prev[key], value }
            }));
        } catch (error) {
            toast.error('Erro ao atualizar');
        } finally {
            setSaving(false);
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
            <h1 className="text-2xl font-bold text-white">Configurações do Sistema</h1>

            <div className="grid gap-4 max-w-2xl">
                {Object.entries(settings).map(([key, setting]) => (
                    <div key={key} className="card p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-white">{key}</p>
                                <p className="text-sm text-gray-500">{setting.description}</p>
                            </div>

                            {setting.type === 'boolean' ? (
                                <button
                                    onClick={() => updateSetting(key, !setting.value)}
                                    className={`px-4 py-2 rounded-lg font-medium ${
                                        setting.value
                                            ? 'bg-green-600 text-white'
                                            : 'bg-dark-700 text-gray-400'
                                    }`}
                                    disabled={saving}
                                >
                                    {setting.value ? 'Ativado' : 'Desativado'}
                                </button>
                            ) : setting.type === 'number' ? (
                                <input
                                    type="number"
                                    value={setting.value}
                                    onChange={(e) => {
                                        setSettings(prev => ({
                                            ...prev,
                                            [key]: { ...prev[key], value: parseInt(e.target.value) }
                                        }));
                                    }}
                                    onBlur={(e) => updateSetting(key, parseInt(e.target.value))}
                                    className="input w-24 text-center"
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={setting.value}
                                    onChange={(e) => {
                                        setSettings(prev => ({
                                            ...prev,
                                            [key]: { ...prev[key], value: e.target.value }
                                        }));
                                    }}
                                    onBlur={(e) => updateSetting(key, e.target.value)}
                                    className="input w-64"
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
