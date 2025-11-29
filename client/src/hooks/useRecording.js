import { useState, useEffect, useRef, useCallback } from 'react';
import { apiHelpers } from '../services/api';

export function useRecording(channelId) {
    const [recording, setRecording] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef(null);

    // Check for active recording
    const checkActiveRecording = useCallback(async () => {
        if (!channelId) return;

        try {
            const response = await apiHelpers.getRecordings({
                channelId,
                status: 'recording'
            });

            const activeRecording = response.data.data.recordings?.[0];
            setRecording(activeRecording || null);
        } catch (error) {
            console.error('Error checking recording status:', error);
        }
    }, [channelId]);

    // Check on mount and periodically
    useEffect(() => {
        if (!channelId) return;

        checkActiveRecording();
        const interval = setInterval(checkActiveRecording, 30000);

        return () => clearInterval(interval);
    }, [channelId, checkActiveRecording]);

    // Update elapsed time counter
    useEffect(() => {
        if (recording && recording.status === 'recording') {
            const startTime = new Date(recording.started_at || recording.created_at).getTime();

            const updateTimer = () => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                setElapsedTime(elapsed);
            };

            updateTimer();
            timerRef.current = setInterval(updateTimer, 1000);

            return () => {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                }
            };
        } else {
            setElapsedTime(0);
        }
    }, [recording]);

    const startRecording = useCallback(async (channelName) => {
        if (loading || !channelId) return;
        setLoading(true);

        try {
            const response = await apiHelpers.startRecording({
                channelId: parseInt(channelId),
                title: `${channelName} - ${new Date().toLocaleString('pt-BR')}`,
                duration: 60
            });

            setRecording(response.data.data.recording);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.response?.data?.error?.message || 'Erro ao iniciar gravação' };
        } finally {
            setLoading(false);
        }
    }, [channelId, loading]);

    const stopRecording = useCallback(async () => {
        if (!recording || loading) return;
        setLoading(true);

        try {
            await apiHelpers.stopRecording(recording.id);
            setRecording(null);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.response?.data?.error?.message || 'Erro ao parar gravação' };
        } finally {
            setLoading(false);
        }
    }, [recording, loading]);

    const formatTime = useCallback((seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    return {
        recording,
        isRecording: recording?.status === 'recording',
        elapsedTime,
        formattedTime: formatTime(elapsedTime),
        loading,
        startRecording,
        stopRecording,
        refresh: checkActiveRecording
    };
}
