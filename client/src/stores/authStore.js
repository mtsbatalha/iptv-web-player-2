import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: true,

            // Inicializar estado
            initialize: async () => {
                const tokens = get().tokens;

                if (!tokens?.accessToken) {
                    set({ isLoading: false });
                    return;
                }

                try {
                    const response = await api.get('/auth/me');
                    set({
                        user: response.data.data.user,
                        isAuthenticated: true,
                        isLoading: false
                    });
                } catch (error) {
                    // Token inválido, limpar estado
                    set({
                        user: null,
                        tokens: null,
                        isAuthenticated: false,
                        isLoading: false
                    });
                }
            },

            // Login
            login: async (email, password) => {
                const response = await api.post('/auth/login', { email, password });
                const { user, tokens } = response.data.data;

                set({
                    user,
                    tokens,
                    isAuthenticated: true,
                    isLoading: false
                });

                return user;
            },

            // Registro
            register: async (data) => {
                const response = await api.post('/auth/register', data);
                const { user, tokens } = response.data.data;

                set({
                    user,
                    tokens,
                    isAuthenticated: true,
                    isLoading: false
                });

                return user;
            },

            // Logout
            logout: async () => {
                try {
                    const tokens = get().tokens;
                    if (tokens?.refreshToken) {
                        await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
                    }
                } catch (error) {
                    console.error('Erro no logout:', error);
                } finally {
                    set({
                        user: null,
                        tokens: null,
                        isAuthenticated: false
                    });
                }
            },

            // Atualizar tokens
            setTokens: (tokens) => {
                set({ tokens });
            },

            // Atualizar usuário
            setUser: (user) => {
                set({ user });
            },

            // Refresh token
            refreshToken: async () => {
                const tokens = get().tokens;

                if (!tokens?.refreshToken) {
                    throw new Error('No refresh token');
                }

                const response = await api.post('/auth/refresh', {
                    refreshToken: tokens.refreshToken
                });

                const newTokens = response.data.data.tokens;
                set({ tokens: newTokens });

                return newTokens.accessToken;
            }
        }),
        {
            name: 'iptv-auth',
            partialize: (state) => ({
                tokens: state.tokens
            })
        }
    )
);

// Inicializar ao carregar
if (typeof window !== 'undefined') {
    useAuthStore.getState().initialize();
}
