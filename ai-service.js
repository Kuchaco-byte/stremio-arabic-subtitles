/**
 * AI Translation Service for ST+
 * Decoupled logic for finding source subtitles and generating AI result objects.
 * Features "Stealth Fetch": finds high-quality English sources even if not selected.
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

    console.log(`[AI-Service] Triggering for ${lang}. Native count: ${rankedNative.length}`);
    console.log(`[AI-Service] Stealth search for S:${season} E:${episode}`);

    // Source priority: English is the "Gold Standard" source for any translation.
    // We search English even if the user didn't select it in their dashboard.
    const sourceLanguages = lang === "eng" ? ["spa", "fre", "ger"] : ["eng", "spa", "fre"];
    let foundSourceSubs = [];
    let foundLang = "";

    for (const srcLang of sourceLanguages) {
        if (srcLang === lang) continue;
        console.log(`[AI-Service] Stealth searching for source: ${srcLang}`);

        const sourcePromises = activeProviders.map(async (p) => {
            try {
                let movieTitle = "";
                if (p.handler.needsTitle) {
                    const meta = await metaPromise;
                    movieTitle = (meta && meta.data && meta.data.meta && meta.data.meta.name) || "";
                }
                // Pass season and episode from params (passed from addon.js)
                return await p.handler.getSubtitles(type, imdbId, movieTitle, season, episode, srcLang, config);
            } catch (e) {
                console.error(`[AI-Service] Provider ${p.name} failed for ${srcLang}:`, e.message);
                return [];
            }
        });

        const sourceResults = await Promise.allSettled(sourcePromises);
        let currentLangSubs = [];

        sourceResults.forEach((res, index) => {
            if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
                const pName = activeProviders[index].name;
                const subsWithSource = res.value.map(s => ({ ...s, source: pName }));
                currentLangSubs = currentLangSubs.concat(subsWithSource);
            }
        });

        if (currentLangSubs.length > 0) {
            foundSourceSubs = currentLangSubs;
            foundLang = srcLang;
            console.log(`[AI-Service] Successfully found ${foundSourceSubs.length} source subs in ${foundLang}`);
            break;
        }
    }

    if (foundSourceSubs.length === 0) {
        console.log(`[AI-Service] No source subtitles found in any stealth language.`);
        return [];
    }

    // Re-rank sources based on filename match using the central helper
    const { rankSubtitles } = require("./addon-helpers");
    const rankedSource = rankSubtitles(foundSourceSubs, filename, foundLang);

    // Take top 10 as requested by the user
    const top10 = rankedSource.slice(0, 10);
    const targetName = getLanguageName(lang);
    const srcName = getLanguageName(foundLang);

    return top10.map((s, i) => {
        const cb = Math.floor(Date.now() / 3600000); // 1-hour cache busting

        // Construct the proxy URL
        let proxyUrl = `${baseUrl}/proxy/subtitle?url=${encodeURIComponent(s.url)}&cb=${cb}&provider=${encodeURIComponent(s.source || "Unknown")}&lang=${encodeURIComponent(foundLang)}`;
        if (s.referer) proxyUrl += `&referer=${encodeURIComponent(s.referer)}`;
        proxyUrl += `&season=${season}&episode=${episode}`;
        proxyUrl += `&translate=${encodeURIComponent(lang)}`;

        const providerTag = s.source === "OpenSubtitles" ? "OS" : (s.source || "UNK");
        const cleanTitle = (s.title || "").replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
        const displayTitle = `🤖 [AI] (${srcName}→${targetName}) [${providerTag}] ${cleanTitle} #${i + 1}`;

        return {
            id: `sub_trans_${foundLang}_i${i}_${uniqueMediaId}`,
            url: proxyUrl,
            lang: lang,
            title: displayTitle,
            originalTitle: cleanTitle,
            fileSize: s.fileSize,
            source: s.source,
            rankScore: s.rankScore
        };
    });
}

module.exports = {
    handleAIFallback
};
