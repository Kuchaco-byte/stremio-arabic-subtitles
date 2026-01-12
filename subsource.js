const axios = require("axios");

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara", config = {}) {
    console.log(`[SubSource] Searching for: ${imdbId} | Lang: ${lang}`);
    try {
        // SubSource Stremio addon pattern
        // Movies: /subtitles/movie/tt...json
        // Series: /subtitles/series/tt...:season:episode.json

        let id = imdbId;
        if (type === 'series') {
            id = `${imdbId}:${season}:${episode}`;
        }

        const subsourceKey = config.subsourceKey || "";
        const { getLanguageName } = require("./languages");
        const displayName = getLanguageName(lang);
        const baseUrl = "https://api.subsource.net/api";

        const { getYIFYCode } = require("./languages");
        const targetLangName = getYIFYCode(lang);

        // Default Config String
        // Pattern: [Key]/[Lang]/hiInclude/type:1,2,4/

        let encodedConfig;
        if (config.subsourceKey) {
            encodedConfig = Buffer.from(`${config.subsourceKey}/${targetLangName}/hiInclude/type:1,2,4/`).toString('base64');
        } else {
            // Fallback public key logic. 
            // Previous: "c2tfMDY...=" -> "sk_0695ceebd2b4ba80cebc30715f315935d22ccb49c207c7309fff8bc6b6223159/arabic/hiInclude/type:1,2,4/"
            const publicKey = "sk_0695ceebd2b4ba80cebc30715f315935d22ccb49c207c7309fff8bc6b6223159";
            encodedConfig = Buffer.from(`${publicKey}/${targetLangName}/hiInclude/type:1,2,4/`).toString('base64');
        }

        const url = `${baseUrl}/${encodedConfig}/subtitles/${type}/${id}.json`;

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.data || !response.data.subtitles) {
            console.log(`[SubSource] No results or empty response from ${url}`);
            return [];
        }

        const limit = config.subsourceLimit || 20;
        const subtitles = response.data.subtitles
            .slice(0, limit)
            .map((sub, idx) => {
                const releaseName = sub.release_name || sub.title || title;
                return {
                    id: `subsource-${sub.id}`,
                    url: sub.full_url || sub.url,
                    lang: displayName, // Stremio compatibility
                    title: `[SubSource] ${releaseName}`, // Assuming relName was a typo for releaseName
                    source: "SubSource",
                    size: sub.size || ""
                };
            });

        console.log(`[SubSource] Found ${subtitles.length} results (Limit: ${limit})`);
        return subtitles;

    } catch (e) {
        console.error(`[SubSource] Error fetching from addon: ${e.message}`);
        return [];
    }
}

module.exports = {
    name: "SubSource",
    needsTitle: false,
    getSubtitles
};
