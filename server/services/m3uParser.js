import axios from 'axios';
import http from 'http';
import https from 'https';
import fs from 'fs/promises';

// Agentes HTTP para conexões persistentes
const httpAgent = new http.Agent({ keepAlive: true, timeout: 120000 });
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 120000 });

/**
 * Parser de arquivos M3U/M3U8
 * Suporta formatos padrão IPTV com tags EXTINF
 */
export class M3UParser {
    constructor() {
        this.channels = [];
        this.categories = new Set();
    }

    /**
     * Parse de conteúdo M3U a partir de URL
     */
    async parseFromUrl(url) {
        try {
            console.log(`[M3UParser] Baixando: ${url}`);
            const startTime = Date.now();

            const response = await axios.get(url, {
                timeout: 180000, // 3 minutos para playlists grandes (66MB+)
                responseType: 'text',
                maxContentLength: 150 * 1024 * 1024, // 150MB max
                maxBodyLength: 150 * 1024 * 1024,
                maxRedirects: 5, // Seguir até 5 redirects
                decompress: true,
                httpAgent: httpAgent,
                httpsAgent: httpsAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache'
                },
                validateStatus: (status) => status < 500
            });

            if (response.status !== 200) {
                throw new Error(`Servidor retornou status ${response.status}`);
            }

            const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const sizeKB = (response.data.length / 1024).toFixed(2);
            console.log(`[M3UParser] Download concluído: ${sizeKB}KB em ${downloadTime}s`);

            return this.parse(response.data);
        } catch (error) {
            console.error(`[M3UParser] Erro detalhado:`, error.code || error.message);
            throw new Error(`Erro ao baixar playlist: ${error.message}`);
        }
    }

    /**
     * Parse de conteúdo M3U a partir de arquivo
     */
    async parseFromFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return this.parse(content);
        } catch (error) {
            throw new Error(`Erro ao ler arquivo: ${error.message}`);
        }
    }

    /**
     * Parse do conteúdo M3U
     */
    parse(content) {
        this.channels = [];
        this.categories = new Set();

        // Normalizar quebras de linha
        const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        // Verificar se é um arquivo M3U válido
        if (!lines[0].trim().startsWith('#EXTM3U')) {
            throw new Error('Arquivo M3U inválido: header #EXTM3U não encontrado');
        }

        let currentChannel = null;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line) continue;

            // Linha EXTINF (informações do canal)
            if (line.startsWith('#EXTINF:')) {
                currentChannel = this.parseExtinf(line);
            }
            // URL do stream (linha após EXTINF)
            else if (currentChannel && !line.startsWith('#')) {
                currentChannel.streamUrl = line;
                this.channels.push(currentChannel);

                if (currentChannel.groupTitle) {
                    this.categories.add(currentChannel.groupTitle);
                }

                currentChannel = null;
            }
            // Ignorar outras tags (#EXTVLCOPT, etc.)
        }

        return {
            channels: this.channels,
            categories: Array.from(this.categories),
            totalChannels: this.channels.length,
            totalCategories: this.categories.size
        };
    }

    /**
     * Parse da linha EXTINF
     * Formato: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Nome do Canal
     */
    parseExtinf(line) {
        const channel = {
            name: '',
            tvgId: '',
            tvgName: '',
            tvgLogo: '',
            groupTitle: '',
            language: '',
            country: '',
            streamUrl: '',
            streamType: 'live',
            isAdult: false,
            quality: '',
            metadata: {}
        };

        // Extrair nome do canal (após a última vírgula)
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
            channel.name = line.substring(commaIndex + 1).trim();
        }

        // Extrair atributos
        const attrPart = line.substring(0, commaIndex);

        // tvg-id
        const tvgIdMatch = attrPart.match(/tvg-id="([^"]*)"/i);
        if (tvgIdMatch) channel.tvgId = tvgIdMatch[1];

        // tvg-name
        const tvgNameMatch = attrPart.match(/tvg-name="([^"]*)"/i);
        if (tvgNameMatch) channel.tvgName = tvgNameMatch[1];

        // tvg-logo
        const tvgLogoMatch = attrPart.match(/tvg-logo="([^"]*)"/i);
        if (tvgLogoMatch) channel.tvgLogo = tvgLogoMatch[1];

        // group-title
        const groupMatch = attrPart.match(/group-title="([^"]*)"/i);
        if (groupMatch) channel.groupTitle = groupMatch[1];

        // tvg-language
        const langMatch = attrPart.match(/tvg-language="([^"]*)"/i);
        if (langMatch) channel.language = langMatch[1];

        // tvg-country
        const countryMatch = attrPart.match(/tvg-country="([^"]*)"/i);
        if (countryMatch) channel.country = countryMatch[1];

        // Detectar tipo de stream
        channel.streamType = this.detectStreamType(channel.name, channel.groupTitle);

        // Detectar conteúdo adulto
        channel.isAdult = this.detectAdultContent(channel.name, channel.groupTitle);

        // Detectar qualidade
        channel.quality = this.detectQuality(channel.name);

        return channel;
    }

    /**
     * Detectar tipo de stream baseado no nome/grupo
     */
    detectStreamType(name, group) {
        const lowerName = (name + ' ' + group).toLowerCase();

        if (lowerName.includes('vod') || lowerName.includes('filme') || lowerName.includes('movie')) {
            return 'vod';
        }

        if (lowerName.includes('serie') || lowerName.includes('series') || lowerName.includes('s0') || lowerName.includes('e0')) {
            return 'series';
        }

        if (lowerName.includes('radio') || lowerName.includes('rádio')) {
            return 'radio';
        }

        return 'live';
    }

    /**
     * Detectar conteúdo adulto
     */
    detectAdultContent(name, group) {
        const lowerText = (name + ' ' + group).toLowerCase();
        const adultKeywords = ['adult', 'xxx', '18+', 'adulto', 'porn', 'erotic'];

        return adultKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Detectar qualidade do stream
     */
    detectQuality(name) {
        const lowerName = name.toLowerCase();

        if (lowerName.includes('4k') || lowerName.includes('uhd')) {
            return '4K';
        }

        if (lowerName.includes('fhd') || lowerName.includes('1080')) {
            return 'FHD';
        }

        if (lowerName.includes('hd') || lowerName.includes('720')) {
            return 'HD';
        }

        if (lowerName.includes('sd') || lowerName.includes('480')) {
            return 'SD';
        }

        return '';
    }

    /**
     * Gerar conteúdo M3U a partir de canais
     */
    static generate(channels, options = {}) {
        let content = '#EXTM3U\n';

        if (options.urlTvg) {
            content = `#EXTM3U url-tvg="${options.urlTvg}"\n`;
        }

        for (const channel of channels) {
            let extinf = '#EXTINF:-1';

            if (channel.tvgId) extinf += ` tvg-id="${channel.tvgId}"`;
            if (channel.tvgName) extinf += ` tvg-name="${channel.tvgName}"`;
            if (channel.tvgLogo) extinf += ` tvg-logo="${channel.tvgLogo}"`;
            if (channel.groupTitle) extinf += ` group-title="${channel.groupTitle}"`;

            extinf += `,${channel.name}\n`;
            extinf += `${channel.streamUrl}\n`;

            content += extinf;
        }

        return content;
    }
}

export default new M3UParser();
