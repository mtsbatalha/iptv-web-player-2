import { create } from 'zustand';

export const usePlayerStore = create((set, get) => ({
    // Current playing channel/stream
    channel: null,
    streamUrl: null,
    isPlaying: false,
    isMiniPlayer: false,

    // Start playing a channel
    play: (channel, streamUrl) => {
        set({
            channel,
            streamUrl,
            isPlaying: true,
            isMiniPlayer: false
        });
    },

    // Minimize to mini player
    minimize: () => {
        const { channel } = get();
        if (channel) {
            set({ isMiniPlayer: true });
        }
    },

    // Expand from mini player to full
    expand: () => {
        set({ isMiniPlayer: false });
    },

    // Stop playback and close player
    stop: () => {
        set({
            channel: null,
            streamUrl: null,
            isPlaying: false,
            isMiniPlayer: false
        });
    },

    // Update playing state
    setPlaying: (isPlaying) => {
        set({ isPlaying });
    }
}));
