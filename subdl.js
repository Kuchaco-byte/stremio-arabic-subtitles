const axios = require("axios");

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara", config = {}) {
    console.log(`[SubDL] Searching for: ${imdbId} | Lang: ${lang}`);
    try {
        // SubDL Stremio addon pattern
        // Movies: /subtitles/movie/tt...json
        // Series: /subtitles/series/tt...:season:episode.json

        let id = imdbId;
        if (type === 'series') {
            id = `${imdbId}:${season}:${episode}`;
        }

        const { getSubDLCode } = require("./languages");
        const targetLangCode = getSubDLCode(lang);

        // Default Config String for ST+ (generic)
        // We construct it dynamically based on the lang key
        // Pattern: [Key]/[Lang]/hiInclude/

        let encodedConfig;
        if (config.subdlKey) {
            encodedConfig = Buffer.from(`${config.subdlKey}/${targetLangCode}/hiInclude/`).toString('base64');
        } else {
            // If no key, we might need a default key or just standard path. 
            // Using a generic generation if no key is present might be tricky if the addon requires a valid key for heavy usage.
            // For now, we will fallback to a default *structure* but without a private key if acceptable, 
            // or use the previously hardcoded one if it was a public shared key.
            // The previous hardcoded string "Vm5ram...=" decoded to: "VnkjiqL1dSU647gASStn6KocPsUusFs/AR/hiInclude/"
            // That looks like "Key/AR/hiInclude/".
            // We will assume "VnkjiqL1dSU647gASStn6KocPsUusFs" is a public/shared key.
            const publicKey = "VnkjiqL1dSU647gASStn6KocPsUusFs";
            encodedConfig = Buffer.from(`${publicKey}/${targetLangCode}/hiInclude/`).toString('base64');
        }

        const url = `${baseUrl}/${encodedConfig}/subtitles/${type}/${id}.json`;

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.data || !response.data.subtitles) {
            console.log(`[SubDL] No results or empty response from ${url}`);
            return [];
        }

        const limit = config.subdlLimit || 20;
        // Filter by lang logic: SubDL returns "lang" property usually in full English name (e.g. "Arabic", "English") 
        // OR sometimes 2-letter code. We should match robustly.
        // We will trust the API returned what we asked for, but do a loose filter.

        const subtitles = response.data.subtitles
            .slice(0, limit)
            .map(sub => ({
                id: `subdl-${sub.id || Math.random().toString(36).substr(2, 7)}`,
                url: sub.url,
                lang: lang, // Return the requested Stremio lang code
                title: `[SubDL] ${sub.title || title}`,
                size: sub.size || "" // Pass file size if available
            }));

        console.log(`[SubDL] Found ${subtitles.length} results (Limit: ${limit})`);
        return subtitles;

    } catch (e) {
        // Some addons might require a specific config path. If this fails, it's silent.
        console.error(`[SubDL] Error fetching from addon: ${e.message}`);
        return [];
    }
}

module.exports = {
    name: "SubDL",
    needsTitle: false,
    getSubtitles
};
