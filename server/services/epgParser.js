import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

/**
 * Parser de EPG no formato XMLTV
 */
export class EPGParser {
    constructor() {
        this.channels = [];
        this.programs = [];
    }

    /**
     * Parse de EPG a partir de URL
     */
    async parseFromUrl(url) {
        try {
            const response = await axios.get(url, {
                timeout: 120000, // 2 minutos
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'IPTV-Player/1.0',
                    'Accept-Encoding': 'gzip, deflate'
                }
            });

            let content = response.data;

            // Verificar se é gzip
            if (url.endsWith('.gz') || response.headers['content-encoding'] === 'gzip') {
                content = await gunzip(content);
            }

            // Converter para string
            const xmlContent = content.toString('utf-8');

            return this.parse(xmlContent);
        } catch (error) {
            throw new Error(`Erro ao baixar EPG: ${error.message}`);
        }
    }

    /**
     * Parse do conteúdo XMLTV
     */
    async parse(xmlContent) {
        this.channels = [];
        this.programs = [];

        try {
            const result = await parseStringPromise(xmlContent, {
                explicitArray: false,
                mergeAttrs: true,
                trim: true
            });

            if (!result.tv) {
                throw new Error('Formato XMLTV inválido');
            }

            const tv = result.tv;

            // Processar canais
            if (tv.channel) {
                const channels = Array.isArray(tv.channel) ? tv.channel : [tv.channel];

                for (const channel of channels) {
                    this.channels.push(this.parseChannel(channel));
                }
            }

            // Processar programas
            if (tv.programme) {
                const programs = Array.isArray(tv.programme) ? tv.programme : [tv.programme];

                for (const program of programs) {
                    this.programs.push(this.parseProgram(program));
                }
            }

            return {
                channels: this.channels,
                programs: this.programs,
                totalChannels: this.channels.length,
                totalPrograms: this.programs.length
            };
        } catch (error) {
            throw new Error(`Erro ao processar XML: ${error.message}`);
        }
    }

    /**
     * Parse de um canal XMLTV
     */
    parseChannel(channel) {
        let displayName = '';
        let icon = '';

        // Display name pode ser string ou objeto
        if (channel['display-name']) {
            if (typeof channel['display-name'] === 'string') {
                displayName = channel['display-name'];
            } else if (Array.isArray(channel['display-name'])) {
                displayName = channel['display-name'][0];
                if (typeof displayName === 'object') {
                    displayName = displayName._ || displayName['#text'] || '';
                }
            } else if (typeof channel['display-name'] === 'object') {
                displayName = channel['display-name']._ || channel['display-name']['#text'] || '';
            }
        }

        // Icon
        if (channel.icon) {
            if (typeof channel.icon === 'string') {
                icon = channel.icon;
            } else if (channel.icon.src) {
                icon = channel.icon.src;
            }
        }

        return {
            channelId: channel.id,
            displayName,
            iconUrl: icon,
            language: this.extractLanguage(channel['display-name'])
        };
    }

    /**
     * Parse de um programa XMLTV
     */
    parseProgram(program) {
        const parsed = {
            channelId: program.channel,
            title: '',
            subtitle: '',
            description: '',
            category: '',
            startTime: this.parseXmltvDate(program.start),
            endTime: this.parseXmltvDate(program.stop),
            duration: 0,
            episodeNum: '',
            seasonNum: '',
            year: '',
            rating: '',
            iconUrl: '',
            isLive: false,
            isNew: false,
            isPremiere: false,
            language: ''
        };

        // Título
        if (program.title) {
            parsed.title = this.extractText(program.title);
            parsed.language = this.extractLanguage(program.title);
        }

        // Subtítulo
        if (program['sub-title']) {
            parsed.subtitle = this.extractText(program['sub-title']);
        }

        // Descrição
        if (program.desc) {
            parsed.description = this.extractText(program.desc);
        }

        // Categoria
        if (program.category) {
            parsed.category = this.extractText(program.category);
        }

        // Episódio
        if (program['episode-num']) {
            const epNum = this.extractText(program['episode-num']);
            const epMatch = epNum.match(/S(\d+)E(\d+)/i) || epNum.match(/(\d+)\.(\d+)/);
            if (epMatch) {
                parsed.seasonNum = epMatch[1];
                parsed.episodeNum = epMatch[2];
            } else {
                parsed.episodeNum = epNum;
            }
        }

        // Ano
        if (program.date) {
            parsed.year = this.extractText(program.date).substring(0, 4);
        }

        // Rating
        if (program.rating) {
            if (typeof program.rating === 'object' && program.rating.value) {
                parsed.rating = this.extractText(program.rating.value);
            } else {
                parsed.rating = this.extractText(program.rating);
            }
        }

        // Ícone
        if (program.icon) {
            if (typeof program.icon === 'string') {
                parsed.iconUrl = program.icon;
            } else if (program.icon.src) {
                parsed.iconUrl = program.icon.src;
            }
        }

        // Flags
        if (program.live) {
            parsed.isLive = true;
        }
        if (program.new) {
            parsed.isNew = true;
        }
        if (program.premiere) {
            parsed.isPremiere = true;
        }

        // Calcular duração em minutos
        if (parsed.startTime && parsed.endTime) {
            parsed.duration = Math.round((parsed.endTime - parsed.startTime) / 60000);
        }

        return parsed;
    }

    /**
     * Extrair texto de elemento XMLTV (pode ser string ou objeto com lang)
     */
    extractText(element) {
        if (!element) return '';

        if (typeof element === 'string') {
            return element;
        }

        if (Array.isArray(element)) {
            const first = element[0];
            if (typeof first === 'string') return first;
            return first._ || first['#text'] || '';
        }

        return element._ || element['#text'] || '';
    }

    /**
     * Extrair idioma de elemento XMLTV
     */
    extractLanguage(element) {
        if (!element) return '';

        if (Array.isArray(element)) {
            element = element[0];
        }

        if (typeof element === 'object' && element.lang) {
            return element.lang;
        }

        return '';
    }

    /**
     * Parse de data XMLTV (formato: YYYYMMDDHHmmss +ZZZZ)
     */
    parseXmltvDate(dateStr) {
        if (!dateStr) return null;

        try {
            // Formato: 20231225120000 +0000
            const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);

            if (!match) return null;

            const [, year, month, day, hour, minute, second, timezone] = match;

            let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

            if (timezone) {
                const tzHours = timezone.substring(0, 3);
                const tzMinutes = timezone.substring(3);
                isoString += `${tzHours}:${tzMinutes}`;
            } else {
                isoString += 'Z';
            }

            return new Date(isoString);
        } catch (error) {
            console.error('Erro ao parsear data XMLTV:', dateStr, error);
            return null;
        }
    }

    /**
     * Encontrar programa atual para um canal
     */
    findCurrentProgram(channelId, programs) {
        const now = new Date();

        return programs.find(p =>
            p.channelId === channelId &&
            p.startTime <= now &&
            p.endTime > now
        );
    }

    /**
     * Encontrar próximos programas para um canal
     */
    findUpcomingPrograms(channelId, programs, limit = 5) {
        const now = new Date();

        return programs
            .filter(p => p.channelId === channelId && p.startTime > now)
            .sort((a, b) => a.startTime - b.startTime)
            .slice(0, limit);
    }
}

export default new EPGParser();
