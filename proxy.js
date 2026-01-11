const axios = require("axios");
const AdmZip = require("adm-zip");
const iconv = require("iconv-lite");
const zlib = require("zlib");
const unrar = require("node-unrar-js");

async function downloadSubtitle(url, season, episode, refererHint, provider) {
    const sStr = season !== undefined ? `S${season}` : "Movie";
    const eStr = episode !== undefined ? `E${episode}` : "";
    console.log(`Downloading subtitle: ${url} (${sStr}${eStr}) | Provider: ${provider}`);
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            'Connection': 'keep-alive'
        };

        if (url.includes('opensubtitles.org')) {
            headers['Referer'] = 'https://www.opensubtitles.org/';
        } else if (url.includes('yts-subs.com')) {
            headers['Referer'] = refererHint || 'https://yts-subs.com/';
        } else if (refererHint) {
            headers['Referer'] = refererHint;
        }

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: headers,
            timeout: 30000,
            maxContentLength: 5000000, // Increased to 5MB for large RARs
            validateStatus: (status) => status < 400 || status === 403
        });

        if (response.status === 403) {
            console.error("Access Forbidden (403) for:", url);
            return null;
        }

        let buffer = response.data;

        // Final size check
        if (!buffer || buffer.length > 5000000) {
            console.error(`[Proxy] File too large or empty (${buffer ? buffer.length : 0} bytes). Skipping.`);
            return null;
        }

        // Decompress Gzip if needed
        if (buffer && buffer.length > 2 && buffer[0] === 0x1F && buffer[1] === 0x8B) {
            try { buffer = zlib.gunzipSync(buffer); } catch (e) { console.error("Gzip failed:", e.message); }
        }

        const contentType = (response.headers['content-type'] || "").toLowerCase();

        // 1. RAR Extraction
        // Signature: Rar! (0x52 0x61 0x72 0x21)
        if ((buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) || url.toLowerCase().includes('.rar') || contentType.includes('rar')) {
            try {
                // Create extractor
                const extractor = await unrar.createExtractorFromData({ data: buffer });
                const list = extractor.getFileList();
                const listEntries = [...list.fileHeaders];

                // Filter for .srt
                const srtEntries = listEntries.filter(entry => !entry.flags.directory && entry.name.toLowerCase().endsWith('.srt'));

                if (srtEntries.length > 0) {
                    let selectedEntry = srtEntries[0];

                    if (srtEntries.length > 1 && season !== undefined && episode !== undefined) {
                        const s = String(season).padStart(2, '0');
                        const e = String(episode).padStart(2, '0');
                        const patterns = [
                            new RegExp(`S${s}E${e}`, 'i'),
                            new RegExp(`${season}x${e}`, 'i'),
                            new RegExp(`E${e}`, 'i'),
                            new RegExp(`Episode\\s*${episode}`, 'i')
                        ];

                        for (const pattern of patterns) {
                            const match = srtEntries.find(entry => pattern.test(entry.name));
                            if (match) {
                                selectedEntry = match;
                                break;
                            }
                        }
                    }

                    console.log(`[Proxy] Extracting RAR entry: ${selectedEntry.name}`);
                    const extracted = extractor.extract({ files: [selectedEntry.name] });
                    if (extracted.files[0].extraction) {
                        buffer = Buffer.from(extracted.files[0].extraction);
                    }
                }
            } catch (e) {
                console.error("RAR Unpack error:", e.message);
                return null;
            }
        }

        // 2. ZIP Extraction
        if ((buffer[0] === 0x50 && buffer[1] === 0x4B) || url.toLowerCase().includes('.zip') || contentType.includes('zip')) {
            try {
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                const srtEntries = zipEntries.filter(entry => entry.entryName.toLowerCase().endsWith('.srt'));

                if (srtEntries.length > 1 && season !== undefined && episode !== undefined) {
                    const s = String(season).padStart(2, '0');
                    const e = String(episode).padStart(2, '0');
                    const patterns = [
                        new RegExp(`S${s}E${e}`, 'i'),
                        new RegExp(`${season}x${e}`, 'i'),
                        new RegExp(`E${e}`, 'i'),
                        new RegExp(`Episode\\s*${episode}`, 'i')
                    ];

                    let bestEntry = null;
                    for (const pattern of patterns) {
                        bestEntry = srtEntries.find(entry => pattern.test(entry.entryName));
                        if (bestEntry) break;
                    }

                    if (bestEntry) {
                        console.log(`[Proxy] Identified episode ${sStr}${eStr} inside ZIP: ${bestEntry.entryName}`);
                        buffer = bestEntry.getData();
                    } else {
                        buffer = srtEntries[0].getData();
                    }
                } else if (srtEntries.length > 0) {
                    buffer = srtEntries[0].getData();
                }
            } catch (e) { console.error("Unzip error:", e.message); return null; }
        }

        // Decode to UTF-8
        let str = "";
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\FB50-\uFDFF\uFE70-\uFEFF]/;
        const utf8Str = buffer.toString('utf8');

        if (arabicRegex.test(utf8Str) && !utf8Str.includes('\uFFFD')) {
            str = utf8Str;
        } else {
            str = iconv.decode(buffer, 'win1256');
            if (!arabicRegex.test(str)) str = iconv.decode(buffer, 'iso-8859-6');
            if (!arabicRegex.test(str)) str = utf8Str; // Fallback
        }

        // Smart Logic: Single Warning
        const lineCount = (str.match(/ --> /g) || []).length;
        if (lineCount < 200) {
            const warningBlock = `9999\n00:00:02,000 --> 00:00:07,000\n⚠️ تحذير: هذه الترجمة قد تكون ناقصة أو دعائية\n\n`;
            str = warningBlock + str;
        }

        // Auto-Correction
        if (arabicRegex.test(str)) str = str.replace(/ی/g, 'ي');

        // Normalize
        str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!str.endsWith('\n')) str += '\n';
        if (arabicRegex.test(str) && !str.startsWith('\uFEFF')) str = '\uFEFF' + str;

        return str;

    } catch (e) {
        console.error("Proxy Error:", e.message);
        return null;
    }
}

module.exports = { downloadSubtitle };
