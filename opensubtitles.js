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
        // We always try /en/ first as it's the most stable path for searching on OS
        let url = `${baseUrl}/en/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
        console.log(`[OpenSubtitles] Requesting IMDB ID search: ${url}`);

        let response;
        try {
            response = await performSearch(url, osLang);
        } catch (err) {
            console.log(`[OpenSubtitles] IMDB search failed: ${err.message}. Trying Title Search...`);
            response = null;
        }

        const cheerio = require("cheerio");
        let $ = response ? cheerio.load(response.data) : null;

        // Check if we are on a results page, a selection page, or something else
        let resultRows = $ ? $('#search_results tr[id^="name"], table.dt tr[id^="name"]') : [];
        let selectionLinks = $ ? $('a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-')) : [];

        // 2. PRIMARY FALLBACK: Title Search (If IMDB search fails or returns nothing)
        if ((!resultRows.length && !selectionLinks.length) && title) {
            const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, '');
            console.log(`[OpenSubtitles] Falling back to Title Search: ${cleanTitle}`);
            const query = encodeURIComponent(cleanTitle);
            url = `${baseUrl}/en/search2/sublanguageid-${osLang}/moviename-${query}`;
            try {
                response = await performSearch(url, osLang);
                $ = cheerio.load(response.data);
                resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
                selectionLinks = $('a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-'));
            } catch (err) {
                console.log(`[OpenSubtitles] Title search failed: ${err.message}`);
            }
        }

        // 3. SELECTION PAGE HANDLING (If we are on a page listing multiple movies/series)
        if (!resultRows.length && selectionLinks.length > 0) {
            console.log(`[OpenSubtitles] Selection page detected. Found ${selectionLinks.length} options.`);
            let selectionLink = null;

            if (type === 'series' && (season !== undefined || episode !== undefined)) {
                // Try to find a link that matches the title or has some series indicator
                selectionLink = selectionLinks.first().attr('href'); // Fallback to first
            } else {
                // For movies, usually the first one or the one matching title best
                selectionLink = selectionLinks.first().attr('href');
            }

            if (selectionLink) {
                const nextUrl = selectionLink.startsWith('http') ? selectionLink : `${baseUrl}${selectionLink}`;
                console.log(`[OpenSubtitles] Following selection: ${nextUrl}`);
                try {
                    response = await performSearch(nextUrl, osLang);
                    $ = cheerio.load(response.data);
                    resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
                } catch (err) {
                    console.log(`[OpenSubtitles] Selection following failed: ${err.message}`);
                }
            }
        }

        const subtitles = [];
        const isDetailPage = $ ? $('a[href*="/subtitleserve/sub/"]').length > 0 && !resultRows.length : false;

        if (isDetailPage) {
            console.log(`[OpenSubtitles] Detail page detected (Direct Landing).`);
            const dlLink = $('a[href*="/subtitleserve/sub/"]').first().attr('href');
            let relName = $('h1').text() || $('title').text() || title;
            if (dlLink) {
                const subId = dlLink.split('/').pop();
                subtitles.push({
                    id: `os-direct-${subId}`,
                    url: `https://www.opensubtitles.org/en/download/sub/${subId}`,
                    lang: lang,
                    title: `[OpenSubtitles] ${relName.trim()}`,
                    source: "OpenSubtitles"
                });
            }
        }

        if (!subtitles.length && !resultRows.length) {
            console.log(`[OpenSubtitles] Still no result rows in the final table.`);
            if (response && response.data) {
                const rawLinks = response.data.match(/\/subtitleserve\/sub\/\d+/g);
                if (rawLinks) {
                    console.log(`[OpenSubtitles] Success! Found ${rawLinks.length} raw download links in body.`);
                    const seenIds = new Set();
                    rawLinks.forEach(link => {
                        const subId = link.split('/').pop();
                        if (!seenIds.has(subId)) {
                            seenIds.add(subId);
                            subtitles.push({
                                id: `os-raw-${subId}`,
                                url: `https://www.opensubtitles.org/en/download/sub/${subId}`,
                                lang: lang,
                                title: `[OpenSubtitles] Release ${subId}`,
                                source: "OpenSubtitles"
                            });
                        }
                    });
                }
            }
        }

        resultRows.each((i, el) => {
            const row = $(el);
            const dlLink = row.find('a[href*="/subtitleserve/sub/"]').first().attr('href');
            let relName = row.find('strong').text() || row.find('a[href*="/subtitles/"]').first().text();

            if (!relName || relName.length < 5) {
                relName = row.find('td[align="left"]').text() || row.text().split('\n')[0];
            }

            if (dlLink) {
                const subId = dlLink.split('/').pop();
                subtitles.push({
                    id: `os-${subId}`,
                    url: `https://www.opensubtitles.org/en/download/sub/${subId}`,
                    lang: lang,
                    title: `[OpenSubtitles] ${relName.trim() || `Release ${subId}`}`,
                    source: "OpenSubtitles"
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.opensubtitles.org/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Cookie': `Language=en; sublanguageid=${osLang}`
        },
        timeout: 20000
    });
}

module.exports = {
    name: "OpenSubtitles",
    needsTitle: true, // Crucial for Title Fallback
    getSubtitles
};
