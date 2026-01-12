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
        const { getOSCode } = require("./languages");
        const osLang = getOSCode(lang);

        // STABILITY RULE: Always use /en/ path for search as localized paths are often broken in scraping.
        // The language is controlled by the sublanguageid parameter.
        let url = `${baseUrl}/en/search/sublanguageid-${osLang}/imdbid-${imdbId.replace('tt', '')}`;
        console.log(`[OpenSubtitles] Requesting URL: ${url}`);

        let response;
        try {
            response = await performSearch(url, osLang);
        } catch (err) {
            console.error(`[OpenSubtitles] Primary search failed: ${err.message}`);
            response = null;
        }

        let $ = response ? cheerio.load(response.data) : null;

        // 1. SELECTOR REFINEMENT: Handle results table and selection links
        let resultRows = $ ? $('#search_results tr[id^="name"], table.dt tr[id^="name"]') : [];
        let selectionLinks = $ ? $('a[href*="/idmovie-"], a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-')) : [];

        // 2. AGGRESSIVE FALLBACK: If IMDB ID search returns 0 results, try Title Search (Arabic Strength model)
        if (!resultRows.length && !selectionLinks.length && title) {
            const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ');
            console.log(`[OpenSubtitles] Falling back to Title Search: ${cleanTitle}`);
            const query = encodeURIComponent(cleanTitle.trim());
            url = `${baseUrl}/en/search2/sublanguageid-${osLang}/moviename-${query}`;
            try {
                response = await performSearch(url, osLang);
                $ = cheerio.load(response.data);
                resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
                selectionLinks = $('a[href*="/idmovie-"], a[href*="/search/sublanguageid-"]').filter((i, el) => $(el).attr('href').includes('idmovie-'));
            } catch (err) {
                console.error(`[OpenSubtitles] Title fallback failed: ${err.message}`);
            }
        }

        // 3. SELECTION REDIRECT HANDLING (Multi-movie selection)
        if (!resultRows.length && selectionLinks.length > 0) {
            console.log(`[OpenSubtitles] Selection page detected. Following first valid option.`);
            const nextLink = selectionLinks.first().attr('href');
            const nextUrl = nextLink.startsWith('http') ? nextLink : `${baseUrl}${nextLink}`;
            try {
                response = await performSearch(nextUrl, osLang);
                $ = cheerio.load(response.data);
                resultRows = $('#search_results tr[id^="name"], table.dt tr[id^="name"]');
            } catch (err) {
                console.error(`[OpenSubtitles] Selection following failed: ${err.message}`);
            }
        }

        const subtitles = [];

        // 4. ROBUST EXTRACTION: Deducing ID even if dlLink is missing from row (Scraping Hardened)
        if (resultRows.length > 0) {
            resultRows.each((i, el) => {
                const row = $(el);
                const dlLink = row.find('a[href*="/subtitleserve/sub/"]').first().attr('href');
                const titleLink = row.find('a[href*="/subtitles/"]').first().attr('href');
                let relName = row.find('strong').text() || row.find('td[align="left"]').text() || "";

                if (!relName || relName.length < 5) {
                    relName = row.text().split('\n').filter(t => t.trim().length > 5)[0] || "";
                }

                // Deduction logic: Extract ID from title link if download link cell is empty
                let subId = "";
                if (dlLink) {
                    subId = dlLink.split('/').pop();
                } else if (titleLink) {
                    const idMatch = titleLink.match(/\/subtitles\/(\d+)\//);
                    if (idMatch) subId = idMatch[1];
                }

                if (subId) {
                    subtitles.push({
                        id: `os-${subId}`,
                        url: `https://www.opensubtitles.org/en/download/sub/${subId}`,
                        lang: lang,
                        title: `[OpenSubtitles] ${relName.trim() || `Release ${subId}`}`,
                        source: "OpenSubtitles"
                    });
                }
            });
        }

        // 5. REDUNDANT SCRAPER (LAST RESORT): Regex scan the raw body for ANY download links
        if (subtitles.length === 0 && response && response.data) {
            const rawLinks = response.data.match(/\/subtitleserve\/sub\/\d+/g);
            if (rawLinks) {
                console.log(`[OpenSubtitles] Using Redundant Scraper (Found ${rawLinks.length} raw links)`);
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

        console.log(`[OpenSubtitles] Final Result Count: ${subtitles.length}`);
        return subtitles.slice(0, 20);

    } catch (e) {
        console.error("[OpenSubtitles] Fatal Error:", e.message);
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
            'Cookie': `Language=en; sublanguageid=${osLang}`
        },
        timeout: 15000
    });
}

module.exports = {
    name: "OpenSubtitles",
    needsTitle: true,
    getSubtitles
};
