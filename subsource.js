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

        const subsourceKey = config.subsourceKey || ""; // User must provide key
        const baseUrl = "https://subsource.strem.top";

        // Use pre-encoded string for default, or encode user key
        let encodedConfig = "c2tfMDY5NWNlZWJkMmI0YmE4MGNlYmMzMDcxNWYzMTU5MzVkMjJjY2I0OWMyMDdjNzMwOWZmZjhiYzZiNjIyMzE1OS9hcmFiaWMvaGlJbmNsdWRlL3R5cGU6MSwyLDQv";
        if (config.subsourceKey) {
            encodedConfig = Buffer.from(`${config.subsourceKey}/arabic/hiInclude/type:1,2,4/`).toString('base64');
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

        const limit = config.subsourceLimit || 5;
        const subtitles = response.data.subtitles
            .filter(sub => sub.lang === lang || sub.lang === 'Arabic' || sub.lang === 'ara')
            .slice(0, limit)
            .map(sub => ({
                id: `subsource-${sub.id || Math.random().toString(36).substr(2, 7)}`,
                url: sub.url,
                lang: 'ara',
                title: `[SubSource] ${sub.title || title}`
            }));

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
