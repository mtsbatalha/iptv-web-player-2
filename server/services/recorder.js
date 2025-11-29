import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { query } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active recording processes
const activeRecordings = new Map();

// Recordings directory
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');

// FFmpeg executable path - check common locations
const FFMPEG_PATHS = [
    'ffmpeg', // System PATH
    'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg'
];

async function findFFmpeg() {
    for (const ffmpegPath of FFMPEG_PATHS) {
        try {
            await fs.access(ffmpegPath.replace('ffmpeg', 'ffmpeg.exe'));
            return ffmpegPath;
        } catch {
            try {
                await fs.access(ffmpegPath);
                return ffmpegPath;
            } catch {
                continue;
            }
        }
    }
    // Fallback to hoping it's in PATH
    return 'ffmpeg';
}

let FFMPEG_PATH = 'ffmpeg';
findFFmpeg().then(p => {
    FFMPEG_PATH = p;
    console.log('[Recorder] FFmpeg path:', FFMPEG_PATH);
});

/**
 * Ensure recordings directory exists
 */
async function ensureRecordingsDir() {
    try {
        await fs.access(RECORDINGS_DIR);
    } catch {
        await fs.mkdir(RECORDINGS_DIR, { recursive: true });
        console.log('[Recorder] Created recordings directory:', RECORDINGS_DIR);
    }
}

/**
 * Start recording a stream using FFmpeg
 * @param {number} recordingId - Database recording ID
 * @param {number} channelId - Channel ID to record (uses internal proxy for stream sharing)
 * @param {string} directStreamUrl - Direct stream URL (fallback if proxy fails)
 * @param {number} durationMinutes - Duration in minutes
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
 */
export async function startRecording(recordingId, channelId, directStreamUrl, durationMinutes = 60) {
    await ensureRecordingsDir();

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `recording_${recordingId}_${timestamp}.mp4`;
    const filePath = path.join(RECORDINGS_DIR, filename);
    const relativeFilePath = filename; // Relative path for database

    // Use internal proxy stream to share connection with player
    const serverPort = process.env.PORT || 3001;
    const streamUrl = `http://127.0.0.1:${serverPort}/api/stream/internal/${channelId}`;

    console.log(`[Recorder] Starting recording ${recordingId}`);
    console.log(`[Recorder] Using shared stream proxy: ${streamUrl}`);
    console.log(`[Recorder] Output: ${filePath}`);
    console.log(`[Recorder] Duration: ${durationMinutes} minutes`);

    // FFmpeg arguments
    const args = [
        '-y', // Overwrite output file
        '-i', streamUrl, // Input stream
        '-t', String(durationMinutes * 60), // Duration in seconds
        '-c:v', 'copy', // Copy video codec (no re-encoding)
        '-c:a', 'copy', // Copy audio codec (no re-encoding)
        '-bsf:a', 'aac_adtstoasc', // Fix AAC audio for MP4 container
        '-movflags', '+faststart', // Enable fast start for web playback
        '-f', 'mp4', // Output format
        filePath
    ];

    return new Promise((resolve) => {
        try {
            console.log(`[Recorder ${recordingId}] Using FFmpeg: ${FFMPEG_PATH}`);
            const ffmpeg = spawn(FFMPEG_PATH, args, {
                // Enable stdin so we can send 'q' to stop gracefully on Windows
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
                // Log progress occasionally
                if (stderr.includes('time=')) {
                    const timeMatch = stderr.match(/time=(\d{2}:\d{2}:\d{2})/);
                    if (timeMatch) {
                        console.log(`[Recorder ${recordingId}] Progress: ${timeMatch[1]}`);
                    }
                }
            });

            ffmpeg.on('error', async (error) => {
                console.error(`[Recorder ${recordingId}] FFmpeg error:`, error.message);
                activeRecordings.delete(recordingId);

                await updateRecordingStatus(recordingId, 'failed', null, error.message);
                resolve({ success: false, error: error.message });
            });

            ffmpeg.on('close', async (code, signal) => {
                activeRecordings.delete(recordingId);

                // null code with signal means killed (e.g., SIGINT from stopRecording)
                // 0 = normal exit, 255 = ffmpeg stopped manually
                const isSuccess = code === 0 || code === 255 || (code === null && signal);

                if (isSuccess) {
                    console.log(`[Recorder ${recordingId}] Recording completed (code: ${code}, signal: ${signal})`);

                    // Get file size
                    try {
                        const stats = await fs.stat(filePath);
                        await updateRecordingStatus(recordingId, 'completed', relativeFilePath, null, stats.size);
                        resolve({ success: true, filePath: relativeFilePath });
                    } catch (err) {
                        console.error(`[Recorder ${recordingId}] Error getting file stats:`, err);
                        await updateRecordingStatus(recordingId, 'completed', relativeFilePath);
                        resolve({ success: true, filePath: relativeFilePath });
                    }
                } else {
                    console.error(`[Recorder ${recordingId}] FFmpeg exited with code ${code}`);
                    await updateRecordingStatus(recordingId, 'failed', null, `FFmpeg exited with code ${code}`);
                    resolve({ success: false, error: `FFmpeg exited with code ${code}` });
                }
            });

            // Store the process reference
            activeRecordings.set(recordingId, {
                process: ffmpeg,
                filePath: relativeFilePath,
                startTime: Date.now()
            });

            // Update database with file path
            query(
                'UPDATE recordings SET file_path = ? WHERE id = ?',
                [relativeFilePath, recordingId]
            ).catch(console.error);

            console.log(`[Recorder ${recordingId}] FFmpeg process started (PID: ${ffmpeg.pid})`);

        } catch (error) {
            console.error(`[Recorder ${recordingId}] Failed to start FFmpeg:`, error);
            resolve({ success: false, error: error.message });
        }
    });
}

/**
 * Stop an active recording
 * @param {number} recordingId - Database recording ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function stopRecording(recordingId) {
    const recording = activeRecordings.get(recordingId);

    if (!recording) {
        console.log(`[Recorder ${recordingId}] No active recording found`);
        return { success: false, error: 'Recording not found or already stopped' };
    }

    console.log(`[Recorder ${recordingId}] Stopping recording...`);

    return new Promise((resolve) => {
        const { process: ffmpeg } = recording;

        // Timeout to force kill if it doesn't stop gracefully
        const timeout = setTimeout(() => {
            console.log(`[Recorder ${recordingId}] Force killing FFmpeg...`);
            ffmpeg.kill('SIGKILL');
        }, 10000); // Give more time for finalization

        // Listen for close event (the main handler in startRecording will update status)
        ffmpeg.once('close', () => {
            clearTimeout(timeout);
            resolve({ success: true });
        });

        // On Windows, send 'q' to stdin to gracefully stop FFmpeg
        // This makes FFmpeg finalize the file properly (write moov atom)
        if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
            console.log(`[Recorder ${recordingId}] Sending 'q' to FFmpeg stdin...`);
            ffmpeg.stdin.write('q');
            ffmpeg.stdin.end();
        } else {
            // Fallback to SIGINT if stdin is not available
            console.log(`[Recorder ${recordingId}] Using SIGINT to stop FFmpeg...`);
            ffmpeg.kill('SIGINT');
        }
    });
}

/**
 * Check if a recording is active
 * @param {number} recordingId - Database recording ID
 * @returns {boolean}
 */
export function isRecordingActive(recordingId) {
    return activeRecordings.has(recordingId);
}

/**
 * Get all active recordings
 * @returns {Array<{id: number, startTime: number}>}
 */
export function getActiveRecordings() {
    return Array.from(activeRecordings.entries()).map(([id, data]) => ({
        id,
        startTime: data.startTime,
        filePath: data.filePath
    }));
}

/**
 * Update recording status in database
 */
async function updateRecordingStatus(recordingId, status, filePath = null, errorMessage = null, fileSize = null) {
    try {
        let sql = 'UPDATE recordings SET status = ?';
        const params = [status];

        if (filePath) {
            sql += ', file_path = ?';
            params.push(filePath);
        }

        if (status === 'completed') {
            sql += ', actual_end_time = NOW(), duration = TIMESTAMPDIFF(SECOND, actual_start_time, NOW())';
        }

        if (errorMessage) {
            sql += ', error_message = ?';
            params.push(errorMessage);
        }

        if (fileSize) {
            sql += ', file_size = ?';
            params.push(fileSize);
        }

        sql += ' WHERE id = ?';
        params.push(recordingId);

        await query(sql, params);
        console.log(`[Recorder ${recordingId}] Status updated to: ${status}`);
    } catch (error) {
        console.error(`[Recorder ${recordingId}] Failed to update status:`, error);
    }
}

/**
 * Clean up on server shutdown
 */
export function cleanupAllRecordings() {
    console.log('[Recorder] Cleaning up all active recordings...');

    for (const [recordingId, recording] of activeRecordings) {
        console.log(`[Recorder ${recordingId}] Stopping...`);
        const ffmpeg = recording.process;

        // Send 'q' to stdin to stop gracefully
        if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
            ffmpeg.stdin.write('q');
            ffmpeg.stdin.end();
        } else {
            ffmpeg.kill('SIGINT');
        }
    }
}

// Handle process termination
process.on('SIGINT', cleanupAllRecordings);
process.on('SIGTERM', cleanupAllRecordings);

export default {
    startRecording,
    stopRecording,
    isRecordingActive,
    getActiveRecordings,
    cleanupAllRecordings
};
