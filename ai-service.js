/**
 * AI Translation Service for ST+
 * Implements aggressive "Stealth Fetch" with absolute priority for English.
 */

const { getLanguageName } = require("./languages");

async function handleAIFallback(params) {
    const {
        type, id, filename, lang, config,
        activeProviders, metaPromise,
        rankedNative, uniqueMediaId, baseUrl,
        season, episode
    } = params;

    const imdbId = id.split(":")[0];
    console.log(`[AI-Service] Stealth Fetching for ${lang}. Target: S:${season} E:${episode}`);

    // Multilingual Search Strategy: English IS FIRST.
    const sourceLanguages = ["eng", "spa", "fre"];

    // We search all concurrent sources to get the BEST candidates
    const searchPromises = sourceLanguages.map(async (srcLang) => {
        if (srcLang === lang) return []; // Don't translate to same lang

        console.log(`[AI-Service] Stealth Search: ${srcLang}`);
        const providerPromises = activeProviders.map(async (p) => {
            try {
                let movieTitle = "";
                if (p.handler.needsTitle) {
                    const meta = await metaPromise;
                    movieTitle = (meta && meta.data && meta.data.meta && meta.data.meta.name) || "";
                }
                const subs = await p.handler.getSubtitles(type, imdbId, movieTitle, season, episode, srcLang, config);
                return subs.map(s => ({ ...s, source: p.name, sourceLang: srcLang }));
            } catch (e) { return []; }
        });

        const results = await Promise.allSettled(providerPromises);
        let currentLangSubs = [];
        results.forEach(res => {
            if (res.status === 'fulfilled') currentLangSubs = currentLangSubs.concat(res.value);
        });
        return currentLangSubs;
    });

    const allSourceResults = await Promise.all(searchPromises);
    let masterSourceList = allSourceResults.flat();

    if (masterSourceList.length === 0) {
        console.log(`[AI-Service] Stealth Fetch failed: No source subtitles found.`);
        return [];
    }

    // Ranking Logic (Source Ranking)
    const { rankSubtitles } = require("./addon-helpers");

    // We rank all sources, but we give a MASSIVE hidden boost to English sources
    masterSourceList = masterSourceList.map(s => {
        const sub = rankSubtitles([s], filename, s.sourceLang)[0];
        if (s.sourceLang === 'eng') sub.rankScore += 500; // Hard-priority for English
        return sub;
    }).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));

    // Pick top 10 unique titles (to avoid translating the same file from 3 providers)
    const top10 = [];
    const seenTitles = new Set();

    for (const sub of masterSourceList) {
        const norm = (sub.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seenTitles.has(norm)) {
            seenTitles.add(norm);
            top10.push(sub);
            if (top10.length >= 10) break;
        }
    }

    const targetName = getLanguageName(lang);

    return top10.map((s, i) => {
        const cb = Math.floor(Date.now() / 3600000);
        const srcName = getLanguageName(s.sourceLang);

        let proxyUrl = `${baseUrl}/proxy/subtitle?url=${encodeURIComponent(s.url)}&cb=${cb}&provider=${encodeURIComponent(s.source || "Unknown")}&lang=${encodeURIComponent(s.sourceLang)}`;
        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
        proxyUrl += `&season=${season}&episode=${episode}`;
        proxyUrl += `&translate=${encodeURIComponent(lang)}`;

        const providerTag = s.source === "OpenSubtitles" ? "OS" : (s.source || "UNK");
        const cleanTitle = (s.title || "").replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
        const displayTitle = `🤖 [AI] (${srcName}→${targetName}) [${providerTag}] ${cleanTitle} #${i + 1}`;

        return {
            id: `sub_trans_${s.sourceLang}_i${i}_${uniqueMediaId}`,
            url: proxyUrl,
            lang: lang,
            title: displayTitle,
            originalTitle: cleanTitle,
            source: s.source,
            rankScore: s.rankScore
        };
    });
}

module.exports = {
    handleAIFallback
};
