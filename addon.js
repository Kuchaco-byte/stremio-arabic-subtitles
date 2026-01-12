const VERSION = "1.0.3";
const VERSION_NAME = "V1_MODULAR";
const CACHE_KEY_PREFIX = "v103";
const axios = require("axios");
const cache = require("./cache");

// Provider imports
const opensubtitles = require("./opensubtitles");
const yify = require("./yify");
const subdl = require("./subdl");
const subsource = require("./subsource");

// Module imports
const { rankSubtitles, deduplicateSubtitles } = require("./addon-helpers");
const { handleAIFallback } = require("./ai-service");

const manifest = {
    "id": "org.stplus.cloud.v1",
    "version": "1.0.3",
    "name": "ST+",
    "description": "Multi-provider subtitles",
    "logo": "/logo.png",
    "behaviorHints": {
        "configurable": true,
        "configurationURL": "/configure"
    },
    "resources": ["subtitles"],
    "types": ["movie", "series"]
};

module.exports = {
    manifest,
    getSubtitles: async (args, config = {}) => {
        const { type, id } = args;
        const filename = (args.extraData && args.extraData.filename) || args.filename || "";
        const lang = config.lang || "ara";
        const autoTranslate = config.autoTranslate === true || config.autoTranslate === 'true';
        const baseUrl = config.baseUrl || "";

        console.log(`[Addon] --- Subtitle Request ---`);
        console.log(`[Addon] Type: ${type} | ID: ${id} | Lang: ${lang} | AI: ${autoTranslate}`);

        const parts = id.split(":");
        const imdbId = parts[0];
        let season = 0, episode = 0;
        if (type === 'series' && parts.length >= 3) {
            season = parseInt(parts[1]);
            episode = parseInt(parts[2]);
        }

        const uniqueMediaId = id.replace(/:/g, '_');
        console.log(`[Addon] IMDB: ${imdbId} | S: ${season} | E: ${episode}`);

        // Cache Key
        const cacheKey = `${CACHE_KEY_PREFIX}:${type}:${id}:${lang}:${config.osCount}:${config.ytsCount}:${config.subdlLimit}:${config.subsourceLimit}:${autoTranslate}`;
        const cachedResults = cache.get(cacheKey);

        if (cachedResults) {
            console.log(`[Addon] Cache HIT for key: ${cacheKey}`);
            return { subtitles: rankSubtitles(cachedResults, filename, lang).slice(0, 40) };
        }

        // 1. Providers Selection
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

        // 2. Fetch Native Results
        const providerPromises = activeProviders.map(async (p) => {
            try {
                let movieTitle = "";
                if (p.handler.needsTitle) {
                    const meta = await metaPromise;
                    movieTitle = (meta && meta.data && meta.data.meta && meta.data.meta.name) || "";
                }
                const subs = await p.handler.getSubtitles(type, imdbId, movieTitle, season, episode, lang, config);
                return subs.map(s => ({ ...s, source: p.name }));
            } catch (e) { return []; }
        });

        const results = await Promise.allSettled(providerPromises);
        let allNative = [];
        results.forEach(res => {
            if (res.status === 'fulfilled') allNative = allNative.concat(res.value);
        });

        // Rank & Deduplicate Native
        let ranked = deduplicateSubtitles(rankSubtitles(allNative, filename, lang));

        // 3. AI Fallback (Modularized)
        if (ranked.length <= 3 && autoTranslate) {
            const aiResults = await handleAIFallback({
                type, id, filename, lang, config,
                activeProviders, metaPromise,
                rankedNative: ranked,
                uniqueMediaId, baseUrl,
                season, episode
            });

            if (aiResults && aiResults.length > 0) {
                // Deduplicate AI results against native ones by title
                const existingTitles = new Set(ranked.map(r => (r.originalTitle || r.title || "").toLowerCase().replace(/[^a-z0-9]/g, "")));
                const uniqueAI = aiResults.filter(t => !existingTitles.has((t.originalTitle || t.title || "").toLowerCase().replace(/[^a-z0-9]/g, "")));

                ranked = ranked.concat(uniqueAI);
            }
        }

        // 4. Empty Result Handling
        if (ranked.length === 0) {
            ranked.push({
                id: `no_subs_${uniqueMediaId}`,
                url: `${baseUrl}/static/empty.vtt`,
                lang: lang,
                title: `❌ No subtitles found for ${lang}`,
                originalTitle: "No Result",
                source: "System",
                rankScore: 0
            });
        }

        // Final Cache & Return
        cache.set(cacheKey, ranked);
        return { subtitles: ranked.slice(0, 40) };
    }
};
