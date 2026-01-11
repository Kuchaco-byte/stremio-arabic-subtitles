const axios = require("axios");
const AdmZip = require("adm-zip");
const iconv = require("iconv-lite");
const zlib = require("zlib");
const unrar = require("node-unrar-js");
const translatte = require("translatte");
const Parser = require("srt-parser-2").default;
const cache = require("./cache"); // Import cache module

async function downloadSubtitle(url, season, episode, refererHint, provider, userLang = "ara", translateTo = null) {
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
        if (lineCount < 100) {
            let warningText = "";
            if (userLang === "ara") {
                warningText = "⚠️ تحذير: هذه الترجمة قد تكون ناقصة أو دعائية";
            } else {
                warningText = "⚠️ Warning: This subtitle has a low line count (<100). It may be incomplete or promotional.";
            }

            const warningBlock = `9999\n00:00:02,000 --> 00:00:07,000\n${warningText}\n\n`;
            str = warningBlock + str;
        }

        // Auto-Correction
        if (arabicRegex.test(str)) str = str.replace(/ی/g, 'ي');

        // Normalize
        str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!str.endsWith('\n')) str += '\n';
        if (arabicRegex.test(str) && !str.startsWith('\uFEFF')) str = '\uFEFF' + str;

        // 4. On-the-fly Translation (If Requested)
        if (translateTo && translateTo !== "eng" && translateTo.length === 3) {

            // CACHE CHECK
            // We use a prefix to distinguish translation cache from addon results
            const transCacheKey = `trans_v2:${url}:${translateTo}`;
            const cachedTrans = cache.get(transCacheKey);
            if (cachedTrans) {
                console.log(`[Proxy] Translation Cache HIT for ${translateTo}`);
                return cachedTrans;
            }

            console.log(`[Proxy] Translating subtitle to: ${translateTo}`);
            try {
                // Try different import patterns for srt-parser-2
                let parser;
                try {
                    const P = require("srt-parser-2");
                    parser = new (P.default || P)();
                } catch (e) {
                    console.error("[Proxy] Parser init failed:", e.message);
                    return str; // Early exit on parser failure
                }

                const srtArray = parser.fromSrt(str);

                // Map Stremio ISO 639-2 codes to Google Translate ISO 639-1
                const langMap = {
                    "ara": "ar", "fre": "fr", "spa": "es", "ger": "de", "ita": "it",
                    "rus": "ru", "tur": "tr", "por": "pt", "dut": "nl", "chi": "zh",
                    "per": "fa", "pol": "pl", "hin": "hi", "tam": "ta", "tel": "te",
                    "mal": "ml", "kor": "ko", "jap": "ja", "heb": "iw", "cze": "cs"
                };
                const targetLang = langMap[translateTo];

                if (targetLang && srtArray.length > 0) {

                    // Optimization: Batching strategies
                    // Google Translate usually handles up to ~5000 chars. We play it safe with 3000.
                    // We also limit lines per batch to avoid massive payloads.
                    const batches = [];
                    let currentBatch = [];
                    let currentCharCount = 0;
                    const MAX_CHARS = 3000;
                    const MAX_LINES = 80;

                    for (const item of srtArray) {
                        const textLen = item.text.length;
                        if (currentBatch.length > 0 && (currentCharCount + textLen > MAX_CHARS || currentBatch.length >= MAX_LINES)) {
                            batches.push(currentBatch);
                            currentBatch = [];
                            currentCharCount = 0;
                        }
                        currentBatch.push(item);
                        currentCharCount += textLen;
                    }
                    if (currentBatch.length > 0) batches.push(currentBatch);

                    console.log(`[Proxy] Total Batches: ${batches.length} | Target: ${targetLang}`);

                    // Process in parallel with concurrency limit
                    // We use a simple chunking for concurrency (e.g., 5 at a time)
                    const CONCURRENCY = 5;
                    const processedBatches = [];

                    for (let i = 0; i < batches.length; i += CONCURRENCY) {
                        const chunk = batches.slice(i, i + CONCURRENCY);
                        const promises = chunk.map(async (batch, batchIdx) => {
                            const texts = batch.map(item => item.text.replace(/\r\n/g, " \n "));
                            // Use a safer separator
                            const separator = " <<<>>> ";
                            const joinedText = texts.join(separator);

                            try {
                                console.log(`[Translation] Batch ${i / CONCURRENCY + 1} size: ${joinedText.length} chars. Target: ${targetLang}`);
                                const res = await translatte(joinedText, { to: targetLang });
                                if (!res || !res.text || typeof res.text !== 'string') throw new Error("Invalid Translation Response");

                                console.log(`[Translation] Batch ${i / CONCURRENCY + 1} Success. Start: ${res.text.substring(0, 50)}...`);
                                // Split using the separator
                                const translatedParts = res.text.split(" <<<>>> ");

                                for (let j = 0; j < batch.length; j++) {
                                    if (translatedParts[j]) {
                                        // Restore newlines and trim
                                        batch[j].text = translatedParts[j].trim().replace(/ \n /g, "\n");
                                    } else {
                                        // Fallback if split failed for this part
                                        // console.warn("[Translation] Missing part for index " + j);
                                    }
                                }
                            } catch (err) {
                                console.error(`[Translation] Batch failed: ${err.message}`);
                            }
                        });
                        await Promise.all(promises);
                    }

                    // Rebuild SRT
                    str = parser.toSrt(srtArray);

                    // Add a visible AI Marker to the subtitle for verification
                    const aiMarker = `0\n00:00:00,500 --> 00:00:01,800\n🤖 ST+ AI Translated [${translateTo.toUpperCase()}]\n\n`;
                    str = aiMarker + str;

                    // Cache the result (TTL: 7 days - translations don't change often)
                    cache.set(transCacheKey, str, 604800);
                }
            } catch (e) {
                console.error("[Proxy] Translation Error:", e.message);
                // Return original if translation fails
            }
        }

        return str;

    } catch (e) {
        console.error("Proxy Error:", e.message);
        return null;
    }
}

module.exports = { downloadSubtitle };
