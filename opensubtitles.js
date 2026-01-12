const axios = require("axios");
const cheerio = require("cheerio");

/**
 * OpenSubtitles Provider - High-Performance Overhaul
 * Implements absolute path stability, ID deduction, and redundant body scraping.
 */
async function getSubtitles(type, imdbId, title, season, episode, lang = "ara", config = {}) {
    console.log(`[OpenSubtitles] Invoking search for ${imdbId} | Language: ${lang}`);
    const baseUrl = "https://www.opensubtitles.org";

    try {
        const { getOSCode, getGoogleCode, getLanguageName } = require("./languages");
        const osLang = getOSCode(lang);
        const displayName = getLanguageName(lang);
        const pathLang = getGoogleCode(lang) || osLang.substring(0, 2);

        // Try localized path FIRST, then English as fallback if needed
        const paths = [`/${pathLang}`, '/en'];
        let response = null;
        let $ = null;

        for (const pathPrefix of paths) {
            let url = `${baseUrl}${pathPrefix}/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
            console.log(`[OpenSubtitles] Trying URL: ${url}`);
            try {
                response = await performSearch(url, osLang);
                if (response && response.data) {
                    $ = cheerio.load(response.data);
                    if ($('#search_results tr[id^="name"]').length > 0 || $('a[href*="/idmovie-"]').length > 0) break;
                }
            } catch (e) { }
        }

        // 1. SELECTOR REFINEMENT: Handle results table and selection links
        let resultRows = $ ? $('#search_results tr[id^="name"], table.dt tr[id^="name"]') : [];
        let selectionLinks = $ ? $('a[href*="/idmovie-"], a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-')) : [];

        // 2. AGGRESSIVE FALLBACK: Title Search
        if (!resultRows.length && !selectionLinks.length && title) {
            const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ');
            console.log(`[OpenSubtitles] Falling back to Title Search: ${cleanTitle}`);
            const query = encodeURIComponent(cleanTitle.trim());
            const url = `${baseUrl}/en/search2/sublanguageid-${osLang}/moviename-${query}`;
            try {
                response = await performSearch(url, osLang);
                $ = cheerio.load(response.data);
                resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
                selectionLinks = $('a[href*="/idmovie-"], a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-'));
            } catch (err) { }
        }

        // 3. SELECTION REDIRECT HANDLING
        if (!resultRows.length && selectionLinks.length > 0) {
            const nextLink = selectionLinks.first().attr('href');
            if (nextLink) {
                const nextUrl = nextLink.startsWith('http') ? nextLink : `${baseUrl}${nextLink}`;
                try {
                    response = await performSearch(nextUrl, osLang);
                    $ = cheerio.load(response.data);
                    resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
                } catch (err) { }
            }
        }

        const subtitles = [];

        // 4. ROBUST EXTRACTION
        if (resultRows.length > 0) {
            resultRows.each((i, el) => {
                const row = $(el);
                const dlLink = row.find('a[href*="/subtitleserve/sub/"]').first().attr('href');
                const titleLink = row.find('a[href*="/subtitles/"]').first().attr('href');

                let relName = row.find('td[id^="main"]').contents().filter((i, el) => el.type === 'text' && $(el).text().trim().length > 5).first().text().trim() ||
                    row.find('strong').text() || row.find('td[align="left"]').text() || "";

                if (!relName || relName.length < 5) {
                    relName = row.text().split('\n').filter(t => t.trim().length > 5 && !t.includes('MB'))[0] || "";
                }

                let subId = dlLink ? dlLink.split('/').pop() : (titleLink ? titleLink.match(/\/subtitles\/(\d+)\//)?.[1] : "");

                if (subId) {
                    const downloadUrl = `https://www.opensubtitles.org/en/download/sub/${subId}`;
                    // Final URL must be proxied to bypass OpenSubtitles UA/Referer blocks in Stremio player
                    const proxiedUrl = `${config.baseUrl || ""}/proxy/subtitle?url=${encodeURIComponent(downloadUrl)}&provider=OpenSubtitles&lang=${lang}`;

                    subtitles.push({
                        id: `os-${subId}`,
                        url: proxiedUrl,
                        lang: displayName, // Stremio expects full name e.g. "French"
                        title: `[OpenSubtitles] ${relName.trim() || `Release ${subId}`}`,
                        source: "OpenSubtitles"
                    });
                }
            });
        }

        // 5. REGEX FALLBACK
        if (subtitles.length === 0 && response && response.data) {
            const rawLinks = response.data.match(/\/subtitleserve\/sub\/\d+/g);
            if (rawLinks) {
                const seenIds = new Set();
                rawLinks.forEach(link => {
                    const subId = link.split('/').pop();
                    if (!seenIds.has(subId)) {
                        seenIds.add(subId);
                        subtitles.push({
                            id: `os-raw-${subId}`,
                            url: `${config.baseUrl || ""}/proxy/subtitle?url=${encodeURIComponent(`https://www.opensubtitles.org/en/download/sub/${subId}`)}&provider=OpenSubtitles&lang=${lang}`,
                            lang: displayName,
                            title: `[OpenSubtitles] Release ${subId}`,
                            source: "OpenSubtitles"
                        });
                    }
                });
            }
        }

        console.log(`[OpenSubtitles] Final Result Count: ${subtitles.length}`);
        return subtitles.slice(0, 20);

    } catch (e) {
        console.error("[OpenSubtitles] Error:", e.message);
        return [];
    }
}

async function performSearch(url, osLang) {
    return await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://www.opensubtitles.org/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': `Language=en; sublanguageid=${osLang}; pref_m_donations=1; pref_m_language=en`
        },
        timeout: 15000
    });
}

module.exports = {
    name: "OpenSubtitles",
    needsTitle: true,
    getSubtitles
};
