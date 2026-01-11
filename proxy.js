const axios = require("axios");
const AdmZip = require("adm-zip");
const iconv = require("iconv-lite");
const zlib = require("zlib");
const unrar = require("node-unrar-js");
const translatte = require("translatte");
const Parser = require("srt-parser-2").default;
const cache = require("./cache");

/**
 * Enhanced Proxy Downloader with Iterative Decoding and Robust Translation
 */
async function downloadSubtitle(url, season, episode, refererHint, provider, userLang = "ara", translateTo = null) {
    const sStr = season !== undefined ? `S${season}` : "Movie";
    const eStr = episode !== undefined ? `E${episode}` : "";
    console.log(`[Proxy] Downloading: ${url} (${sStr}${eStr}) | Lang: ${userLang}`);

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive'
        };

        if (url.includes('opensubtitles.org')) headers['Referer'] = 'https://www.opensubtitles.org/';
        if (refererHint) headers['Referer'] = refererHint;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: headers,
            timeout: 30000,
            validateStatus: (status) => status < 400
        });

        let buffer = response.data;
        if (!buffer || buffer.byteLength === 0) return null;

        // Decompress Gzip
        if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
            try { buffer = zlib.gunzipSync(buffer); } catch (e) { }
        }

        const contentType = (response.headers['content-type'] || "").toLowerCase();

        // 1. Archive Handling (RAR/ZIP)
        if (url.toLowerCase().includes('.rar') || contentType.includes('rar') || (buffer[0] === 0x52 && buffer[1] === 0x61)) {
            try {
                const extractor = await unrar.createExtractorFromData({ data: buffer });
                const list = extractor.getFileList();
                const entries = [...list.fileHeaders].filter(e => e.name.toLowerCase().endsWith('.srt'));
                if (entries.length > 0) {
                    let best = entries[0];
                    if (entries.length > 1 && season !== undefined) {
                        const s = String(season).padStart(2, '0');
                        const e = String(episode).padStart(2, '0');
                        best = entries.find(ent => ent.name.includes(`S${s}E${e}`) || ent.name.includes(`${season}x${e}`)) || entries[0];
                    }
                    const extracted = extractor.extract({ files: [best.name] });
                    buffer = Buffer.from(extracted.files[0].extraction);
                }
            } catch (e) { console.error("[Proxy] RAR error:", e.message); }
        } else if (url.toLowerCase().includes('.zip') || contentType.includes('zip') || (buffer[0] === 0x50 && buffer[1] === 0x4B)) {
            try {
                const zip = new AdmZip(buffer);
                const entries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.srt'));
                if (entries.length > 0) {
                    let best = entries[0];
                    if (entries.length > 1 && season !== undefined) {
                        const s = String(season).padStart(2, '0');
                        const e = String(episode).padStart(2, '0');
                        best = entries.find(ent => ent.entryName.includes(`S${s}E${e}`) || ent.entryName.includes(`${season}x${e}`)) || entries[0];
                    }
                    buffer = best.getData();
                }
            } catch (e) { console.error("[Proxy] ZIP error:", e.message); }
        }

        // 2. Iterative Decoding Model
        let str = "";
        const { getEncodings } = require("./languages");
        const encodings = getEncodings(userLang);

        const utf8Try = buffer.toString('utf8');
        if (!utf8Try.includes('\uFFFD')) {
            str = utf8Try;
        } else {
            for (const enc of encodings) {
                const dec = iconv.decode(buffer, enc);
                if (!dec.includes('\uFFFD')) {
                    str = dec;
                    console.log(`[Proxy] Decoded with: ${enc}`);
                    break;
                }
            }
            if (!str) str = utf8Try;
        }

        // 3. Translation Engine
        if (translateTo && translateTo !== userLang) {
            const cacheKey = `trans_v3:${url}:${translateTo}`;
            const cached = cache.get(cacheKey);
            if (cached) return cached;

            console.log(`[Proxy] AI Translating to ${translateTo}...`);
            try {
                const { getGoogleCode } = require("./languages");
                const target = getGoogleCode(translateTo);
                let parser;
                try {
                    const P = require("srt-parser-2");
                    parser = new (P.default || P)();
                } catch (e) { return str; }

                const srtArray = parser.fromSrt(str);
                if (srtArray.length === 0) return str;

                // Robust Batching
                const BATCH_SIZE = 50;
                const TRANSLATION_SEPARATOR = "\n[#]\n";

                for (let i = 0; i < srtArray.length; i += BATCH_SIZE) {
                    const batch = srtArray.slice(i, i + BATCH_SIZE);
                    const joined = batch.map(b => b.text.replace(/\n/g, " ")).join(TRANSLATION_SEPARATOR);

                    try {
                        const res = await translatte(joined, { to: target });
                        const translatedParts = res.text.split(/\[#\]/i).map(t => t.trim());
                        batch.forEach((item, idx) => {
                            if (translatedParts[idx]) item.text = translatedParts[idx];
                        });
                    } catch (e) { console.error("[Translation] Batch failed:", e.message); }
                }

                str = parser.toSrt(srtArray);
                const marker = `0\n00:00:00,500 --> 00:00:01,500\n🤖 ST+ AI [${translateTo.toUpperCase()}]\n\n`;
                str = marker + str;
                cache.set(cacheKey, str, 604800);
            } catch (e) { console.error("[Proxy] AI failed:", e.message); }
        }

        // Final normalization
        str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (userLang === "ara" && !str.startsWith('\uFEFF')) str = '\uFEFF' + str;

        return str;

    } catch (e) {
        console.error("[Proxy] Fatal:", e.message);
        return null;
    }
}

module.exports = { downloadSubtitle };
