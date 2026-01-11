const { addonBuilder } = require("stremio-addon-sdk");
const VERSION = "1.0.0";
const VERSION_NAME = "V1_FINAL";
const CACHE_KEY_PREFIX = "v100";
const axios = require("axios");
const { fuzzyMatch } = require("./string-utils");
const fs = require("fs");

// Provider imports
const opensubtitles = require("./opensubtitles");
const yify = require("./yify");
const subdl = require("./subdl");
const subsource = require("./subsource");
const cache = require("./cache");

const manifest = {
    "id": "org.antigravity.stplus.v100",
    "version": "1.0.0",
    "name": "ST+",
    "description": "Supported Subs (YTS, OS, SubDL, SubSource) - Ordered byGlobal Ranking .",
    "logo": "https://stremio-arabic-subtitles-1.onrender.com/logo.png",
    "behaviorHints": {
        "configurable": true,
        "configurationURL": "https://arabic-subtitles-pro.onrender.com/configure"
    },
    "resources": [
        "subtitles"
    ],
    "languages": ["all"], // Enable all languages to support dynamic selection
    "types": [
        "movie",
        "series"
    ],
    "catalogs": []
};

// Helper to get Base URL
function getBaseUrl() {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    return "http://127.0.0.1:7000";
}

/**
 * Expert Ranking with Fuzzy Matching and Top Rated Bonus
 */
function rankSubtitles(subtitles, filename) {
    if (!filename) return subtitles;
    const fn = filename.toLowerCase().replace(/[^a-z0-9]/g, ' ');

    return subtitles.map(sub => {
        let score = 0;
        const subTitle = sub.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');

        // 1. Exact/Close Match Bonus (Fuzzy)
        const similarity = fuzzyMatch(fn, subTitle);
        score += Math.floor(similarity * 100);

        // 2. Format & Quality Match
        const qualities = [
            { name: "bluray", weight: 60 },
            { name: "1080p", weight: 50 },
            { name: "720p", weight: 40 },
            { name: "web-dl", weight: 50 },
            { name: "webrip", weight: 40 },
            { name: "brrip", weight: 50 },
            { name: "remux", weight: 70 },
            { name: "uhd", weight: 60 },
            { name: "4k", weight: 60 },
            { name: "hdr", weight: 50 }
        ];

        qualities.forEach(q => {
            if (fn.includes(q.name)) {
                if (subTitle.includes(q.name)) {
                    score += q.weight; // Boost for match
                } else {
                    // Check for MISMATCH (e.g. filename has bluray, sub has hdcam)
                    const lowerQualities = ["cam", "ts", "hdts", "tc", "dvdscr", "scr"];
                    lowerQualities.forEach(lq => {
                        if (subTitle.includes(lq)) score -= 100; // Penalize bad quality for good file
                    });
                }
            }
        });

        // 3. Trusted Groups
        const groups = ["yify", "psa", "rarbg", "evo", "fgt", "nitro", "tigole", "joy", "yts"];
        groups.forEach(group => {
            if (fn.includes(group) && subTitle.includes(group)) score += 80;
        });

        // 4. "Top Rated" / Verified Bonus
        if (sub.title.toLowerCase().includes("top rated") || sub.title.toLowerCase().includes("best") || sub.title.toLowerCase().includes("متوافقة")) {
            score += 150;
        }

        // 5. Penalize "Generic" or unrelated results
        if (sub.title.length < 5) score -= 50;

        sub.rankScore = score;
        return sub;
    }).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
}

/**
 * Smart Deduplication
 * Matches subtitles by Normalized Title AND Size (if available)
 * Keeps the highest ranked version of duplicates.
 */
function deduplicateSubtitles(subtitles) {
    const unique = new Map();
    subtitles.forEach(sub => {
        // Fingerprint: "title|size"
        // Normalize: lowercase, alphanumeric only
        const normTitle = (sub.originalTitle || sub.title).toLowerCase().replace(/[^a-z0-9]/g, "");
        const sizeInfo = sub.fileSize || "";

        // If size is present, it makes the fingerprint strict. 
        // If size is missing, we rely on title match only.
        const key = `${normTitle}|${sizeInfo}`;

        if (!unique.has(key)) {
            unique.set(key, sub);
        } else {
            // Because input is already sorted by Rank, the first one we see is the best.
            // We discard duplicates (lower rank).
        }
    });
    return Array.from(unique.values());
}

module.exports = {
    manifest,
    getSubtitles: async (args, config = {}) => {
        const { type, id } = args;
        const filename = (args.extraData && args.extraData.filename) || args.filename || "";
        const lang = config.lang || "ara";
        const osCount = parseInt(config.osCount) || 5;
        const ytsCount = parseInt(config.ytsCount) || 3;
        const subdlLimit = parseInt(config.subdlLimit) || 5;
        const subsourceLimit = parseInt(config.subsourceLimit) || 5;
        const subdlKey = config.subdlKey || "";
        const subsourceKey = config.subsourceKey || "";

        const imdbId = id.split(":")[0];
        const extra = id.split(":").slice(1);
        let season = 0, episode = 0;

        if (type === 'series' && extra.length >= 2) {
            season = parseInt(extra[0]);
            episode = parseInt(extra[1]);
        }

        // UNIQUE ID per Episode to prevent Stremio cache collision
        const uniqueMediaId = id.replace(/:/g, '_');

        const cacheKey = `${CACHE_KEY_PREFIX}:${type}:${id}:${lang}:${osCount}:${ytsCount}:${config.autoTranslate || false}`;
        const cachedResults = cache.get(cacheKey);

        const baseUrl = getBaseUrl();

        if (cachedResults) {
            console.log(`[Addon] Cache HIT for key: ${cacheKey} | Results: ${cachedResults.length}`);
            return { subtitles: rankSubtitles(cachedResults, filename) };
        }

        // 2. Main Providers Fetch
        let activeProviders = [];
        if (type === 'movie') {
            activeProviders = [
                { name: "YTS", handler: yify },
                { name: "OpenSubtitles", handler: opensubtitles },
                { name: "SubDL", handler: subdl },
                { name: "SubSource", handler: subsource }
            ];
        } else {
            activeProviders = [
                { name: "OpenSubtitles", handler: opensubtitles },
                { name: "SubDL", handler: subdl },
                { name: "SubSource", handler: subsource }
            ];
        }

        const metaPromise = axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`).catch(() => null);

        const providerPromises = activeProviders.map(async (p) => {
            try {
                let movieTitle = "";
                if (p.handler.needsTitle) {
                    const meta = await metaPromise;
                    movieTitle = (meta && meta.data && meta.data.meta && meta.data.meta.name) || "";
                }
                return await p.handler.getSubtitles(type, imdbId, movieTitle, season, episode, lang, config);
            } catch (e) { return []; }
        });

        const providerResults = await Promise.allSettled(providerPromises);
        let allSubtitles = [];

        providerResults.forEach((res, index) => {
            const pName = activeProviders[index].name;
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                // Increased buffer to 40 to allow for extensive deduplication "replacement"
                const subtitles = res.value.slice(0, 40).map((s, i) => {
                    if (s.url) {
                        const cb = Math.floor(Date.now() / 3600000);
                        let proxyUrl = `${baseUrl}/proxy/subtitle?url=${encodeURIComponent(s.url)}&cb=${cb}&provider=${encodeURIComponent(pName)}&lang=${encodeURIComponent(lang)}`;
                        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
                        proxyUrl += `&season=${season}&episode=${episode}`;

                        const providerTag = pName === "OpenSubtitles" ? "OS" : pName;
                        const cleanTitle = s.title.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();

                        // Visual Reliability Indicator
                        const isReliable = s.title.toLowerCase().includes("bluray") || s.title.toLowerCase().includes("web-dl") || s.title.toLowerCase().includes("psa");
                        const displayTitle = isReliable ? `⭐ [${providerTag}] ${cleanTitle}` : `[${providerTag}] ${cleanTitle}`;

                        return {
                            id: `sub_${pName.toLowerCase()}_${i}_${uniqueMediaId}`,
                            url: proxyUrl,
                            lang: lang,
                            title: displayTitle,
                            originalTitle: cleanTitle, // Store original for deduplication
                            fileSize: s.size,          // Store size for deduplication
                            source: pName,
                            rankScore: s.rankScore
                        };
                    }
                    return null;
                }).filter(s => s);
                allSubtitles = allSubtitles.concat(subtitles);
            }
        });

        // 3. Return standard results
        cache.set(cacheKey, allSubtitles);
        let ranked = rankSubtitles(allSubtitles, filename);

        // Apply Smart Deduplication (Filter duplicates, keeping highest rank)
        ranked = deduplicateSubtitles(ranked);

        // 3. Smart Auto-Translation Fallback
        if (ranked.length === 0 && config.autoTranslate === true && lang !== "eng") {
            console.log(`[Addon] No results for ${lang}. Auto-Translation Enabled.`);

            // Priority List: English -> Spanish -> French -> German
            const sourceLanguages = ["eng", "spa", "fre", "ger"];
            let foundSourceSubs = [];
            let foundLang = "";

            for (const srcLang of sourceLanguages) {
                // Skip if the target language IS one of the source languages (e.g. user wants Spanish, don't use Spanish as source)
                // actually, if user wants Spanish and we found 0 results above, we shouldn't be here. 
                // But if user wants "bra" (Portuguese) and we have "por" (Portuguese), we might mistake it. 
                // For safety, avoiding self-translation is good, but "eng" is already checked.
                if (srcLang === lang) continue;

                console.log(`[Addon] AI: Trying source language: ${srcLang}`);

                const sourcePromises = activeProviders.map(async (p) => {
                    try {
                        let movieTitle = "";
                        if (p.handler.needsTitle) {
                            const meta = await metaPromise;
                            movieTitle = (meta && meta.data && meta.data.meta && meta.data.meta.name) || "";
                        }
                        return await p.handler.getSubtitles(type, imdbId, movieTitle, season, episode, srcLang, config);
                    } catch (e) { return []; }
                });

                const sourceResults = await Promise.allSettled(sourcePromises);
                let currentLangSubs = [];

                sourceResults.forEach((res) => {
                    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                        currentLangSubs = currentLangSubs.concat(res.value);
                    }
                });

                if (currentLangSubs.length > 0) {
                    foundSourceSubs = currentLangSubs;
                    foundLang = srcLang;
                    break; // Found a valid source, stop looking
                }
            }

            if (foundSourceSubs.length > 0) {
                console.log(`[Addon] AI: Found ${foundSourceSubs.length} subtitles in ${foundLang}. preparing translation...`);

                // Rank the source subtitles first to get the best ones
                const rankedSource = rankSubtitles(foundSourceSubs, filename);

                // Deduplicate source
                const dedupedSource = deduplicateSubtitles(rankedSource);

                // Take TOP 3
                const top3 = dedupedSource.slice(0, 3);

                const translatedResults = top3.map((s, i) => {
                    if (s.url) {
                        const cb = Math.floor(Date.now() / 3600000);
                        // Append &translate=TARGET_LANG
                        let proxyUrl = `${baseUrl}/proxy/subtitle?url=${encodeURIComponent(s.url)}&cb=${cb}&provider=${encodeURIComponent(s.source || "Unknown")}&lang=${encodeURIComponent(foundLang)}`;
                        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
                        proxyUrl += `&season=${season}&episode=${episode}`;
                        proxyUrl += `&translate=${encodeURIComponent(lang)}`; // Trigger Translation

                        const providerTag = (s.source === "OpenSubtitles") ? "OS" : (s.source || "UNK");
                        const cleanTitle = s.title.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
                        // Capitalize Lang
                        const srcLangCap = foundLang.charAt(0).toUpperCase() + foundLang.slice(1);

                        // Flag title as AI Translated with Source
                        // e.g. 🤖 [AI] (Eng) [OS] Title
                        const displayTitle = `🤖 [AI] (${srcLangCap}) [${providerTag}] ${cleanTitle}`;

                        return {
                            id: `sub_trans_${foundLang}_${i}_${uniqueMediaId}`,
                            url: proxyUrl,
                            lang: lang, // WE PRETEND it is the target language so Stremio shows it
                            title: displayTitle,
                            originalTitle: cleanTitle,
                            fileSize: s.fileSize,
                            source: s.source,
                            rankScore: s.rankScore
                        };
                    }
                    return null;
                }).filter(s => s);

                ranked = translatedResults; // Replace empty results with these AI results
            }
        }

        // 4. Final Fallback: If absolutely no results, return a "No Subtitles Found" Dummy
        // This prevents Stremio from disabling the language in the UI, allowing the user to see the attempt.
        if (ranked.length === 0) {
            console.log(`[Addon] No subtitles found for ${lang} (Native or AI). Returning Dummy.`);
            ranked.push({
                id: `no_subs_${uniqueMediaId}`,
                url: `${baseUrl}/static/empty.vtt`, // Static URL instead of Data URI
                lang: lang,
                title: `❌ No subtitles found for ${lang}`,
                originalTitle: "No Result",
                fileSize: "0",
                source: "System",
                rankScore: 0
            });
        }

        return { subtitles: ranked.slice(0, 40) }; // Global Smart Sort, Top 40 Unique
    }
};
