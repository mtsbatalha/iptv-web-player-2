import axios from 'axios';
import http from 'http';
import https from 'https';
import fs from 'fs/promises';

// Agentes HTTP com configurações otimizadas para Cloudflare/SSL
const httpAgent = new http.Agent({
    keepAlive: true,
    timeout: 120000,
    maxSockets: 10
});

const httpsAgent = new https.Agent({
    keepAlive: true,
    timeout: 120000,
    maxSockets: 10,
    rejectUnauthorized: true, // Pode ser false para URLs problemáticas
    minVersion: 'TLSv1.2'
});

// Agente HTTPS permissivo para URLs com certificados problemáticos
const httpsAgentInsecure = new https.Agent({
    keepAlive: true,
    timeout: 120000,
    rejectUnauthorized: false
});

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
     * Parse de conteúdo M3U a partir de URL com retry
     */
    async parseFromUrl(url, options = {}) {
        const maxRetries = options.retries || 3;
        const allowInsecure = options.allowInsecure || false;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[M3UParser] Tentativa ${attempt}/${maxRetries}: ${url}`);
                return await this._fetchAndParse(url, allowInsecure, attempt);
            } catch (error) {
                lastError = error;
                console.error(`[M3UParser] Tentativa ${attempt} falhou:`, error.message);

                // Se for erro de SSL na primeira tentativa, tenta com agente inseguro
                if (attempt === 1 && this._isSSLError(error) && !allowInsecure) {
                    console.log('[M3UParser] Erro SSL detectado, tentando modo permissivo...');
                    try {
                        return await this._fetchAndParse(url, true, attempt);
                    } catch (retryError) {
                        lastError = retryError;
                        console.error('[M3UParser] Modo permissivo também falhou:', retryError.message);
                    }
                }

                // Aguardar antes de próxima tentativa (exceto na última)
                if (attempt < maxRetries) {
                    const delay = attempt * 2000; // 2s, 4s, 6s
                    console.log(`[M3UParser] Aguardando ${delay / 1000}s antes de tentar novamente...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * Verifica se é erro de SSL/TLS
     */
    _isSSLError(error) {
        const sslErrors = [
            'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            'CERT_HAS_EXPIRED',
            'DEPTH_ZERO_SELF_SIGNED_CERT',
            'SELF_SIGNED_CERT_IN_CHAIN',
            'ERR_TLS_CERT_ALTNAME_INVALID',
            'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
            'certificate',
            'SSL',
            'TLS'
        ];

        const errorStr = (error.code || '') + (error.message || '');
        return sslErrors.some(e => errorStr.includes(e));
    }

    /**
     * Fetch e parse interno
     */
    async _fetchAndParse(url, useInsecureAgent = false, attempt = 1) {
        const startTime = Date.now();

        // Configurar timeout baseado na tentativa (mais tempo em retries)
        const timeout = 60000 + (attempt * 30000); // 90s, 120s, 150s

        const config = {
            timeout: timeout,
            responseType: 'text',
            maxContentLength: 200 * 1024 * 1024, // 200MB max
            maxBodyLength: 200 * 1024 * 1024,
            maxRedirects: 10,
            decompress: true,
            httpAgent: httpAgent,
            httpsAgent: useInsecureAgent ? httpsAgentInsecure : httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/plain, application/x-mpegurl, application/vnd.apple.mpegurl, */*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            validateStatus: (status) => status >= 200 && status < 400
        };

        // Headers especiais para contornar Cloudflare
        if (url.includes('cloudflare') || url.includes('cf-')) {
            config.headers['CF-Connecting-IP'] = '127.0.0.1';
        }

        console.log(`[M3UParser] Baixando (timeout: ${timeout / 1000}s, insecure: ${useInsecureAgent})...`);

        const response = await axios.get(url, config);

        const downloadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const contentType = response.headers['content-type'] || 'unknown';
        const sizeKB = response.data ? (response.data.length / 1024).toFixed(2) : 0;

        console.log(`[M3UParser] Download OK: ${sizeKB}KB em ${downloadTime}s (${contentType})`);

        // Verificar se recebemos uma página HTML (possível challenge Cloudflare)
        if (contentType.includes('text/html') && response.data.includes('<!DOCTYPE')) {
            if (response.data.includes('cloudflare') || response.data.includes('cf-')) {
                throw new Error('Cloudflare está bloqueando a requisição. Tente adicionar o IP do servidor na whitelist do Cloudflare.');
            }
            if (response.data.includes('captcha') || response.data.includes('challenge')) {
                throw new Error('O servidor está exigindo verificação CAPTCHA. Não é possível baixar automaticamente.');
            }
            // Pode ser uma página de erro
            console.warn('[M3UParser] Resposta parece ser HTML, verificando conteúdo...');
        }

        // Verificar conteúdo mínimo
        if (!response.data || response.data.length < 10) {
            throw new Error('Resposta vazia ou muito curta do servidor');
        }

        return this.parse(response.data);
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
        let epgUrl = null;

        // Normalizar quebras de linha
        const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        // Verificar se é um arquivo M3U válido (pode não ter #EXTM3U em algumas playlists)
        const firstLine = lines[0].trim();
        if (!firstLine.startsWith('#EXTM3U') && !firstLine.startsWith('#EXTINF')) {
            // Tentar encontrar #EXTM3U ou #EXTINF nas primeiras linhas
            let foundM3U = false;
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                if (lines[i].includes('#EXTM3U') || lines[i].includes('#EXTINF')) {
                    foundM3U = true;
                    break;
                }
            }
            if (!foundM3U) {
                throw new Error('Arquivo M3U inválido: header #EXTM3U ou #EXTINF não encontrado');
            }
        }

        // Extrair URL do EPG do header #EXTM3U
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTM3U')) {
                // Tentar diferentes formatos de atributo de EPG
                const urlTvgMatch = line.match(/url-tvg="([^"]+)"/i);
                const xTvgUrlMatch = line.match(/x-tvg-url="([^"]+)"/i);
                const tvgUrlMatch = line.match(/tvg-url="([^"]+)"/i);

                epgUrl = urlTvgMatch?.[1] || xTvgUrlMatch?.[1] || tvgUrlMatch?.[1] || null;

                if (epgUrl) {
                    console.log(`[M3UParser] EPG URL encontrada no header: ${epgUrl}`);
                }
                break;
            }
        }

        let currentChannel = null;

        for (let i = 0; i < lines.length; i++) {
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

        console.log(`[M3UParser] Parse concluído: ${this.channels.length} canais, ${this.categories.size} categorias${epgUrl ? ', EPG URL detectada' : ''}`);

        return {
            channels: this.channels,
            categories: Array.from(this.categories),
            totalChannels: this.channels.length,
            totalCategories: this.categories.size,
            epgUrl: epgUrl
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
