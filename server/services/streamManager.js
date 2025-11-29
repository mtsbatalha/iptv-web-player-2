import axios from 'axios';
import { PassThrough } from 'stream';
import { EventEmitter } from 'events';

/**
 * StreamManager - Manages shared stream connections
 * Allows multiple consumers (player, recorder) to share a single upstream connection
 */
class StreamManager extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map(); // streamUrl -> StreamSession
    }

    /**
     * Get or create a stream session for a URL
     * @param {string} streamUrl - The upstream stream URL
     * @param {string} channelName - Channel name for logging
     * @returns {Promise<{stream: PassThrough, contentType: string}>}
     */
    async getStream(streamUrl, channelName = 'Unknown') {
        let session = this.activeStreams.get(streamUrl);

        if (session && !session.closed) {
            // Existing session - wait for it to be ready then add consumer
            console.log(`[StreamManager] Adding consumer to existing stream: ${channelName}`);
            await session.waitForReady();
            const consumer = session.addConsumer();
            return {
                stream: consumer,
                contentType: session.contentType || 'application/octet-stream'
            };
        }

        // Create new session
        console.log(`[StreamManager] Creating new stream session: ${channelName}`);
        session = new StreamSession(streamUrl, channelName, () => {
            this.activeStreams.delete(streamUrl);
            console.log(`[StreamManager] Stream session ended: ${channelName}`);
        });

        this.activeStreams.set(streamUrl, session);

        // Start and wait for connection
        await session.start();

        const consumer = session.addConsumer();
        return {
            stream: consumer,
            contentType: session.contentType || 'application/octet-stream'
        };
    }

    /**
     * Get active stream count
     */
    getActiveCount() {
        return this.activeStreams.size;
    }

    /**
     * Get stats for all active streams
     */
    getStats() {
        const stats = [];
        for (const [url, session] of this.activeStreams) {
            stats.push({
                channelName: session.channelName,
                consumers: session.consumers.size,
                bytesTransferred: session.bytesTransferred,
                startedAt: session.startedAt
            });
        }
        return stats;
    }
}

/**
 * StreamSession - Manages a single stream and its consumers
 */
class StreamSession {
    constructor(streamUrl, channelName, onClose) {
        this.streamUrl = streamUrl;
        this.channelName = channelName;
        this.onClose = onClose;
        this.consumers = new Set();
        this.closed = false;
        this.ready = false;
        this.readyPromise = null;
        this.readyResolve = null;
        this.readyReject = null;
        this.bytesTransferred = 0;
        this.startedAt = Date.now();
        this.response = null;
        this.contentType = null;
        this.error = null;

        // Create ready promise
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
    }

    /**
     * Wait for the stream to be ready
     */
    async waitForReady() {
        if (this.ready) return;
        if (this.error) throw this.error;
        return this.readyPromise;
    }

    /**
     * Add a new consumer to this stream
     * @returns {PassThrough}
     */
    addConsumer() {
        const consumer = new PassThrough({
            highWaterMark: 1024 * 1024 // 1MB buffer
        });

        this.consumers.add(consumer);
        console.log(`[StreamManager] Consumer added to ${this.channelName} (${this.consumers.size} total)`);

        consumer.on('close', () => {
            this.removeConsumer(consumer);
        });

        consumer.on('error', () => {
            this.removeConsumer(consumer);
        });

        return consumer;
    }

    /**
     * Remove a consumer from this stream
     */
    removeConsumer(consumer) {
        if (!this.consumers.has(consumer)) return;

        this.consumers.delete(consumer);
        console.log(`[StreamManager] Consumer removed from ${this.channelName} (${this.consumers.size} remaining)`);

        // If no more consumers, close the upstream connection after a delay
        // (give time for new consumers to connect, e.g., recorder after player)
        if (this.consumers.size === 0) {
            setTimeout(() => {
                if (this.consumers.size === 0) {
                    this.close();
                }
            }, 2000);
        }
    }

    /**
     * Start the upstream connection
     */
    async start() {
        try {
            console.log(`[StreamManager] Connecting to upstream: ${this.streamUrl}`);

            this.response = await axios({
                method: 'GET',
                url: this.streamUrl,
                responseType: 'stream',
                timeout: 60000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Connection': 'keep-alive',
                    'Referer': new URL(this.streamUrl).origin + '/'
                }
            });

            // Detect content type
            const contentType = this.response.headers['content-type'] || '';
            const url = this.streamUrl.toLowerCase();

            if (url.includes('.m3u8') || contentType.includes('mpegurl')) {
                this.contentType = 'application/vnd.apple.mpegurl';
            } else if (url.includes('.ts') || contentType.includes('mp2t') || contentType.includes('video/ts')) {
                this.contentType = 'video/mp2t';
            } else if (contentType.includes('octet-stream') && url.includes('.ts')) {
                this.contentType = 'video/mp2t';
            } else {
                this.contentType = contentType || 'application/octet-stream';
            }

            console.log(`[StreamManager] Stream connected: ${this.channelName}, Content-Type: ${this.contentType}`);

            // Mark as ready
            this.ready = true;
            this.readyResolve();

            // Pipe data to all consumers
            this.response.data.on('data', (chunk) => {
                this.bytesTransferred += chunk.length;

                for (const consumer of this.consumers) {
                    try {
                        if (!consumer.writableEnded && !consumer.destroyed) {
                            const canWrite = consumer.write(chunk);
                            if (!canWrite) {
                                // Handle backpressure - in a real scenario we might pause upstream
                            }
                        }
                    } catch (err) {
                        this.removeConsumer(consumer);
                    }
                }
            });

            this.response.data.on('end', () => {
                console.log(`[StreamManager] Upstream ended: ${this.channelName}`);
                this.close();
            });

            this.response.data.on('error', (err) => {
                console.error(`[StreamManager] Upstream error: ${this.channelName}`, err.message);
                this.close();
            });

        } catch (error) {
            console.error(`[StreamManager] Connection failed: ${this.channelName}`, error.message);
            this.error = error;
            this.readyReject(error);
            this.close();
            throw error;
        }
    }

    /**
     * Close the session and all consumers
     */
    close() {
        if (this.closed) return;
        this.closed = true;

        console.log(`[StreamManager] Closing session: ${this.channelName}`);

        // End all consumer streams
        for (const consumer of this.consumers) {
            try {
                if (!consumer.destroyed) {
                    consumer.end();
                }
            } catch (e) {
                // Ignore
            }
        }
        this.consumers.clear();

        // Close upstream
        if (this.response?.data) {
            try {
                this.response.data.destroy();
            } catch (e) {
                // Ignore
            }
        }

        // Notify manager
        if (this.onClose) {
            this.onClose();
        }
    }
}

// Singleton instance
const streamManager = new StreamManager();

export default streamManager;
export { StreamManager };
