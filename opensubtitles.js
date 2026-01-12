const axios = require("axios");

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara") {
    console.log(`OpenSubtitles searching for: ${imdbId} | Title: ${title} | Lang: ${lang}`);
    const baseUrl = "https://www.opensubtitles.org";

    try {
        const { getOSCode, getGoogleCode } = require("./languages");
        const osLang = getOSCode(lang);
        const pathLang = getGoogleCode(lang) || osLang.substring(0, 2);

        console.log(`[OpenSubtitles] Target Lang: ${lang} | OS Code: ${osLang} | Path: ${pathLang}`);

        // 1. PRIMARY SEARCH: Search by IMDB ID (Most accurate)
        let url = `${baseUrl}/${pathLang}/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
        let response;
        try {
            response = await performSearch(url, osLang);
        } catch (err) {
            console.log(`[OpenSubtitles] Primary search failed for ${lang}: ${err.message}`);
            // Fallback to searching without the language-specific path if that failed
            url = `${baseUrl}/en/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
            response = await performSearch(url, osLang);
        }

        const cheerio = require("cheerio");
        let $ = cheerio.load(response.data);
        let resultRows = $('#search_results tr[id^="name"]');

        let selectionRows = $('#search_results tr.change');
        let hasDirectLinks = resultRows.length > 0 && resultRows.find('a[href*="/subtitleserve/sub/"]').length > 0;
        let rows = hasDirectLinks ? resultRows : selectionRows;

        // 2. PRIMARY FALLBACK: Title Search (If IMDB search yields no results OR search yields a selection that is empty)
        if (rows.length === 0 && title) {
            console.log(`[OpenSubtitles] IMDB search/selection returned 0 results for ${lang}. Falling back to Title Search: ${title}`);
            const query = encodeURIComponent(title.replace(/[^a-zA-Z0-9\s]/g, ''));
            url = `${baseUrl}/${pathLang}/search2/sublanguageid-${osLang}/moviename-${query}`;
            response = await performSearch(url, osLang);
            $ = cheerio.load(response.data);
            resultRows = $('#search_results tr[id^="name"]');
            selectionRows = $('#search_results tr.change');
            hasDirectLinks = resultRows.length > 0 && resultRows.find('a[href*="/subtitleserve/sub/"]').length > 0;
            rows = hasDirectLinks ? resultRows : selectionRows;
        }

        if (!hasDirectLinks && rows.length > 0) {
            console.log(`[OpenSubtitles] No direct links, handling selection page...`);
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
                selectionLink = rows.find(`a[href*="/search/sublanguageid-${osLang}/"]`).first().attr('href') ||
                    rows.find('a[href*="idmovie-"]').first().attr('href') ||
                    rows.find('a[href*="/search/sublanguageid-"]').first().attr('href');
            }

            if (selectionLink) {
                const nextUrl = selectionLink.startsWith('http') ? selectionLink : `${baseUrl}${selectionLink}`;
                console.log(`[OpenSubtitles] Following selection link: ${nextUrl}`);
                response = await performSearch(nextUrl, osLang);
                $ = cheerio.load(response.data);
                rows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
            }
        }

        const subtitles = [];
        if (rows.length === 0) {
            console.log(`[OpenSubtitles] No results found in parsed table. Body length: ${response.data.length}`);
            // Let's try to look for links in the whole body as a last resort
            const rawLinks = response.data.match(/\/subtitleserve\/sub\/\d+/g);
            if (rawLinks) {
                console.log(`[OpenSubtitles] Found ${rawLinks.length} raw download links!`);
                const seenIds = new Set();
                rawLinks.forEach(link => {
                    const subId = link.split('/').pop();
                    if (!seenIds.has(subId)) {
                        seenIds.add(subId);
                        subtitles.push({
                            id: `os-raw-${subId}`,
                            url: `https://dl.opensubtitles.org/${osLang.substring(0, 2)}/download/sub/${subId}`,
                            lang: lang,
                            title: `[OpenSubtitles] Release ${subId}`
                        });
                    }
                });
            }
        }

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
