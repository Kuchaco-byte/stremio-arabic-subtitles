const axios = require("axios");

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara") {
    console.log(`OpenSubtitles searching for: ${imdbId} | Title: ${title} | Lang: ${lang}`);
    const baseUrl = "https://www.opensubtitles.org";

    try {
        const { getOSCode, getGoogleCode } = require("./languages");
        const osLang = getOSCode(lang);
        const pathLang = getGoogleCode(lang) || osLang.substring(0, 2);

        // 1. PRIMARY SEARCH: Search by IMDB ID (Most accurate)
        let url = `${baseUrl}/${pathLang}/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
        let response = await performSearch(url, osLang);

        const cheerio = require("cheerio");
        let $ = cheerio.load(response.data);
        let resultRows = $('#search_results tr[id^="name"]');

        // 2. STRENGTH FALLBACK: Search by Title (If IMDB fails)
        // This is a hallmark of the "Arabic Model" excellence
        if (resultRows.length === 0 && title) {
            console.log(`[OpenSubtitles] IMDB search failed for ${lang}. Falling back to Title Search: ${title}`);
            const query = encodeURIComponent(title.replace(/[^a-zA-Z0-9\s]/g, ''));
            url = `${baseUrl}/${pathLang}/search2/sublanguageid-${osLang}/moviename-${query}`;
            response = await performSearch(url, osLang);
            $ = cheerio.load(response.data);
            resultRows = $('#search_results tr[id^="name"]');
        }

        let selectionRows = $('#search_results tr.change');
        let hasDirectLinks = resultRows.length > 0 && resultRows.find('a[href*="/subtitleserve/sub/"]').length > 0;
        let rows = hasDirectLinks ? resultRows : selectionRows;

        if (!hasDirectLinks && rows.length > 0) {
            let selectionLink = null;
            if (type === 'series') {
                const sStr = season < 10 ? `0${season}` : season;
                const eStr = episode < 10 ? `0${episode}` : episode;
                const epPattern = new RegExp(`S${sStr}E${eStr}|${season}x${episode}`, 'i');

                rows.each((i, el) => {
                    if (epPattern.test($(el).text())) {
                        selectionLink = $(el).find('a[href*="/search/sublanguageid-"]').first().attr('href') || $(el).find('a').first().attr('href');
                        if (selectionLink) return false;
                    }
                });
            } else {
                selectionLink = rows.find(`a[href*="/search/sublanguageid-${osLang}/"]`).first().attr('href') || rows.find('a[href*="idmovie-"]').first().attr('href');
            }

            if (selectionLink) {
                const nextUrl = selectionLink.startsWith('http') ? selectionLink : `${baseUrl}${selectionLink}`;
                response = await performSearch(nextUrl, osLang);
                $ = cheerio.load(response.data);
                rows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
            }
        }

        const subtitles = [];
        rows.each((i, el) => {
            const dlLink = $(el).find('a[href*="/subtitleserve/sub/"]').attr('href');
            const relName = $(el).find('strong').text() || $(el).find('a[href*="/subtitles/"]').first().text();
            if (dlLink && relName) {
                const subId = dlLink.split('/').pop();
                subtitles.push({
                    id: `os-${subId}`,
                    url: `https://dl.opensubtitles.org/${osLang.substring(0, 2)}/download/sub/${subId}`,
                    lang: lang,
                    title: relName.trim()
                });
            }
        });

        // Filter by series episode if needed
        if (type === 'series' && season !== undefined) {
            const sStr = season < 10 ? `0${season}` : season;
            const eStr = episode < 10 ? `0${episode}` : episode;
            const strictPattern = new RegExp(`S${sStr}E${eStr}|${season}x${episode}`, 'i');
            const filtered = subtitles.filter(s => strictPattern.test(s.title));
            return filtered.length > 0 ? filtered : subtitles.slice(0, 15);
        }

        return subtitles.slice(0, 20);

    } catch (e) {
        console.error("[OpenSubtitles] Error:", e.message);
        return [];
    }
}

async function performSearch(url, osLang) {
    return await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.opensubtitles.org/',
            'Cookie': `Language=${osLang.substring(0, 2)}`
        },
        timeout: 15000
    });
}

module.exports = {
    name: "OpenSubtitles",
    needsTitle: true, // Crucial for Title Fallback
    getSubtitles
};
