import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor de requisição
api.interceptors.request.use(
    (config) => {
        // Obter token do localStorage
        const authData = localStorage.getItem('iptv-auth');

        if (authData) {
            try {
                const { state } = JSON.parse(authData);
                if (state?.tokens?.accessToken) {
                    config.headers.Authorization = `Bearer ${state.tokens.accessToken}`;
                }
            } catch (e) {
                console.error('Erro ao parsear auth data:', e);
            }
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Interceptor de resposta
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;

        // Token expirado - tentar refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const authData = localStorage.getItem('iptv-auth');

                if (authData) {
                    const { state } = JSON.parse(authData);

                    if (state?.tokens?.refreshToken) {
                        const response = await axios.post('/api/auth/refresh', {
                            refreshToken: state.tokens.refreshToken
                        });

                        const newTokens = response.data.data.tokens;

                        // Atualizar tokens no localStorage
                        const newAuthData = {
                            state: {
                                ...state,
                                tokens: newTokens
                            }
                        };
                        localStorage.setItem('iptv-auth', JSON.stringify(newAuthData));

                        // Refazer requisição original
                        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
                        return api(originalRequest);
                    }
                }
            } catch (refreshError) {
                // Refresh falhou, limpar dados e redirecionar
                localStorage.removeItem('iptv-auth');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        // Mostrar erro ao usuário
        const errorMessage = error.response?.data?.error?.message || 'Erro de conexão';

        if (error.response?.status !== 401) {
            toast.error(errorMessage);
        }

        return Promise.reject(error);
    }
);

export default api;

// Helpers para requisições comuns
export const apiHelpers = {
    // Playlists
    getPlaylists: (params) => api.get('/playlists', { params }),
    getPlaylist: (id) => api.get(`/playlists/${id}`),
    createPlaylistFromUrl: (data) => api.post('/playlists/url', data),
    uploadPlaylist: (formData) => api.post('/playlists/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    updatePlaylist: (id, data) => api.put(`/playlists/${id}`, data),
    deletePlaylist: (id) => api.delete(`/playlists/${id}`),
    syncPlaylist: (id) => api.post(`/playlists/${id}/sync`),
    getPlaylistSyncStatus: (id) => api.get(`/playlists/${id}/sync-status`),

    // Canais
    getChannels: (params) => api.get('/channels', { params }),
    getChannel: (id) => api.get(`/channels/${id}`),
    searchChannels: (q) => api.get('/channels/search', { params: { q } }),

    // Categorias
    getCategories: (params) => api.get('/categories', { params }),
    getGroups: (params) => api.get('/categories/groups', { params }),

    // Favoritos
    getFavorites: () => api.get('/favorites'),
    addFavorite: (channelId) => api.post(`/favorites/${channelId}`),
    removeFavorite: (channelId) => api.delete(`/favorites/${channelId}`),

    // Histórico
    getHistory: (params) => api.get('/history', { params }),
    addToHistory: (data) => api.post('/history', data),
    clearHistory: (period) => api.delete('/history/clear', { params: { period } }),
    getHistoryStats: () => api.get('/history/stats'),

    // EPG
    getEpgSources: () => api.get('/epg/sources'),
    addEpgSource: (data) => api.post('/epg/sources', data),
    syncEpgSource: (id) => api.post(`/epg/sources/${id}/sync`),
    deleteEpgSource: (id) => api.delete(`/epg/sources/${id}`),
    getChannelGuide: (channelId, date) => api.get(`/epg/guide/${channelId}`, { params: { date } }),
    getCurrentProgram: (channelId) => api.get(`/epg/now/${channelId}`),
    searchEpgPrograms: (params) => api.get('/epg/search', { params }),
    mapChannelEpg: (channelId, epgChannelId) => api.post('/epg/mapping', { channelId, epgChannelId }),
    autoMapEpg: (playlistId) => api.post('/epg/auto-map', { playlistId }),

    // Gravações
    getRecordings: (params) => api.get('/recordings', { params }),
    getRecording: (id) => api.get(`/recordings/${id}`),
    scheduleRecording: (data) => api.post('/recordings/schedule', data),
    startRecording: (data) => api.post('/recordings/start', data),
    stopRecording: (id) => api.post(`/recordings/${id}/stop`),
    cancelRecording: (id) => api.post(`/recordings/${id}/cancel`),
    deleteRecording: (id) => api.delete(`/recordings/${id}`),
    deleteRecordings: (ids) => api.delete('/recordings/bulk', { data: { ids } }),

    // Stream
    getStreamToken: (channelId) => api.post('/stream/token', { channelId }),
    checkStream: (channelId) => api.get(`/stream/check/${channelId}`),

    // Usuário
    getProfile: () => api.get('/auth/me'),
    updateProfile: (data) => api.put('/users/profile', data),
    uploadAvatar: (formData) => api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getUserStats: () => api.get('/users/stats'),
    getUserSettings: () => api.get('/users/settings'),
    updateUserSetting: (key, value) => api.put(`/users/settings/${key}`, { value }),

    // Admin
    getAdminStats: () => api.get('/admin/stats'),
    getAdminUsers: (params) => api.get('/admin/users', { params }),
    getAdminUser: (id) => api.get(`/admin/users/${id}`),
    createAdminUser: (data) => api.post('/admin/users', data),
    updateAdminUser: (id, data) => api.put(`/admin/users/${id}`, data),
    deleteAdminUser: (id) => api.delete(`/admin/users/${id}`),
    resetUserPassword: (id, newPassword) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
    getAdminPlans: () => api.get('/admin/plans'),
    createAdminPlan: (data) => api.post('/admin/plans', data),
    updateAdminPlan: (id, data) => api.put(`/admin/plans/${id}`, data),
    getActivityLogs: (params) => api.get('/admin/logs/activity', { params }),
    getSystemLogs: (params) => api.get('/admin/logs/system', { params })
};
