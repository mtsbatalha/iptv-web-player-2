import { useState, useEffect } from 'react';
import { apiHelpers } from '../../services/api';
import { HiDocumentText } from 'react-icons/hi';
import clsx from 'clsx';

export default function AdminLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logType, setLogType] = useState('activity');

    useEffect(() => {
        loadLogs();
    }, [logType]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const response = logType === 'activity'
                ? await apiHelpers.getActivityLogs({ limit: 50 })
                : await apiHelpers.getSystemLogs({ limit: 50 });

            setLogs(response.data.data.logs);
        } catch (error) {
            console.error('Erro ao carregar logs:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-white">Logs do Sistema</h1>

            <div className="flex gap-2">
                <button
                    onClick={() => setLogType('activity')}
                    className={clsx(
                        'px-4 py-2 rounded-lg font-medium',
                        logType === 'activity' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400'
                    )}
                >
                    Atividades
                </button>
                <button
                    onClick={() => setLogType('system')}
                    className={clsx(
                        'px-4 py-2 rounded-lg font-medium',
                        logType === 'system' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400'
                    )}
                >
                    Sistema
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="spinner"></div>
                </div>
            ) : logs.length > 0 ? (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-dark-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Data</th>
                                {logType === 'activity' ? (
                                    <>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Usuário</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Ação</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Entidade</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Nível</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Componente</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Mensagem</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-800">
                            {logs.map((log, index) => (
                                <tr key={index} className="hover:bg-dark-800/50">
                                    <td className="px-4 py-3 text-sm text-gray-300">
                                        {new Date(log.created_at).toLocaleString('pt-BR')}
                                    </td>
                                    {logType === 'activity' ? (
                                        <>
                                            <td className="px-4 py-3 text-sm text-white">{log.username || '-'}</td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{log.action}</td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{log.entity_type}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-3">
                                                <span className={clsx('badge', {
                                                    'badge-danger': log.level === 'error',
                                                    'badge-warning': log.level === 'warning',
                                                    'badge-success': log.level === 'info'
                                                })}>
                                                    {log.level}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-300">{log.component}</td>
                                            <td className="px-4 py-3 text-sm text-gray-300 truncate max-w-md">{log.message}</td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="card p-12 text-center">
                    <HiDocumentText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">Nenhum log encontrado</p>
                </div>
            )}
        </div>
    );
}
