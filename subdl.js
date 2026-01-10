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

        const subdlKey = config.subdlKey || ""; // User must provide key
        const baseUrl = "https://subdl.strem.top";

        // Use pre-encoded string for default, or encode user key
        let encodedConfig = "Vm5ramlqcUwxZFNVNjQ3Z0FTU3RuNktvY1BzVXVzRnMvQVIvaGlJbmNsdWRlLw==";
        if (config.subdlKey) {
            encodedConfig = Buffer.from(`${config.subdlKey}/AR/hiInclude/`).toString('base64');
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

        const subtitles = response.data.subtitles
            .filter(sub => sub.lang === lang || sub.lang === 'Arabic')
            .map(sub => ({
                id: `subdl-${sub.id || Math.random().toString(36).substr(2, 7)}`,
                url: sub.url,
                lang: 'ara',
                title: `[SubDL] ${sub.title || title}`
            }));

        console.log(`[SubDL] Found ${subtitles.length} results`);
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
