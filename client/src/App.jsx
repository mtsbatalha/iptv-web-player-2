import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import MiniPlayer from './components/MiniPlayer';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';

// Páginas públicas
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Páginas autenticadas
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import ChannelPlayer from './pages/ChannelPlayer';
import Playlists from './pages/Playlists';
import PlaylistDetail from './pages/PlaylistDetail';
import Favorites from './pages/Favorites';
import History from './pages/History';
import EPG from './pages/EPG';
import Recordings from './pages/Recordings';
import Settings from './pages/Settings';

// Páginas admin
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminPlans from './pages/admin/AdminPlans';
import AdminEPG from './pages/admin/AdminEPG';
import AdminLogs from './pages/admin/AdminLogs';
import AdminSettings from './pages/admin/AdminSettings';

// Componente de proteção de rotas
function ProtectedRoute({ children, adminOnly = false }) {
    const { isAuthenticated, user, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && !['admin', 'superadmin'].includes(user?.role)) {
        return <Navigate to="/" replace />;
    }

    return children;
}

function App() {
    return (
        <>
        <Routes>
            {/* Rotas públicas */}
            <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
            </Route>

            {/* Rotas autenticadas */}
            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/channels/:id" element={<ChannelPlayer />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/playlists/:id" element={<PlaylistDetail />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/history" element={<History />} />
                <Route path="/epg" element={<EPG />} />
                <Route path="/recordings" element={<Recordings />} />
                <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Rotas admin */}
            <Route element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/plans" element={<AdminPlans />} />
                <Route path="/admin/epg" element={<AdminEPG />} />
                <Route path="/admin/logs" element={<AdminLogs />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MiniPlayer />
        </>
    );
}

export default App;
