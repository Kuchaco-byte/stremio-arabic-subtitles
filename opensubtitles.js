const axios = require("axios");

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara") {
    console.log(`OpenSubtitles searching for: ${imdbId} | Lang: ${lang}`);
    try {
        const baseUrl = "https://www.opensubtitles.org";
        // Convert 'ara' to 'ara' or 'eng' to 'eng' (standard ISO codes)
        let url = `${baseUrl}/${lang}/search/sublanguageid-${lang}/imdbid-${imdbId.replace('tt', '')}`;

        let response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Referer': baseUrl + '/',
                'Cookie': 'Language=ar; PHPSESSID=stremio_client_v1'
            },
            validateStatus: (status) => status < 500
        });

        if (response.status !== 200) {
            console.log(`OpenSubtitles blocked: ${response.status}`);
            return [];
        }

        const cheerio = require("cheerio");
        let $ = cheerio.load(response.data);
        let selectionLink = null;

        // Check if we are on a selection page or direct list
        let resultRows = $('#search_results tr[id^="name"]');
        let selectionRows = $('#search_results tr.change');

        let hasDirectLinks = resultRows.length > 0 && resultRows.find('a[href*="/subtitleserve/sub/"]').length > 0;
        console.log(`[OpenSubtitles] resultRows: ${resultRows.length}, selectionRows: ${selectionRows.length}, hasDirectLinks: ${hasDirectLinks}`);

        let rows = hasDirectLinks ? resultRows : selectionRows;

        if (!hasDirectLinks) {
            console.log("[OpenSubtitles] No direct file rows found, checking for selection rows...");
            selectionLink = null;

            if (type === 'series') {
                const sStr = season < 10 ? `0${season}` : season;
                const eStr = episode < 10 ? `0${episode}` : episode;
                const epPattern = new RegExp(`^\\[S${sStr}E${eStr}\\]|^S${sStr}E${eStr}|^${season}x${episode}|^${episode}\\.|^${episode}\\s`, 'i');
                console.log(`[OpenSubtitles] Looking for episode pattern: ${epPattern}`);

                rows.each((i, el) => {
                    const text = $(el).text().trim();
                    if (epPattern.test(text)) {
                        const link = $(el).find('a[href*="/search/sublanguageid-ara/"]').first().attr('href');
                        console.log(`[OpenSubtitles] Found matching row text: ${text.substring(0, 50)}... Link: ${link}`);
                        if (link) {
                            selectionLink = link;
                            return false;
                        }
                    }
                });
            } else {
                selectionLink = rows.find('a[href*="/search/sublanguageid-ara/"]').first().attr('href') || rows.find('a[href*="idmovie-"]').first().attr('href');
                console.log(`[OpenSubtitles] Movie selection link: ${selectionLink}`);
            }

            if (selectionLink) {
                const nextUrl = selectionLink.startsWith('http') ? selectionLink : `${baseUrl}${selectionLink}`;
                console.log(`[OpenSubtitles] Redirecting to selection: ${nextUrl}`);
                response = await axios.get(nextUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Cookie': 'Language=ar'
                    }
                });
                $ = cheerio.load(response.data);
                rows = $('#search_results tr[id^="name"]');
                hasDirectLinks = rows.find('a[href*="/subtitleserve/sub/"]').length > 0;
                console.log(`[OpenSubtitles] After redirect, found ${rows.length} result rows, hasDirectLinks: ${hasDirectLinks}`);
            }
        }

        const subtitles = [];
        const seriesTitleParts = title ? title.toLowerCase().split(/\s+/).filter(p => p.length > 2) : [];
        const isEpisodePage = selectionLink && selectionLink.includes('imdbid-') && type === 'series';

        rows.each((i, el) => {
            const downloadLink = $(el).find('a[href*="/subtitleserve/sub/"]').attr('href');
            const titleEl = $(el).find('strong').length > 0 ? $(el).find('strong') : $(el).find('a[href*="/subtitles/"]').first();
            const relName = titleEl.text();

            if (downloadLink && relName) {
                const subId = downloadLink.split('/').pop();
                const directLink = `https://dl.opensubtitles.org/ar/download/sub/${subId}`;

                const relNameLower = relName.toLowerCase();
                // If we have title parts, check relevance. Otherwise, assume relevant if it's an episode page or movie search.
                const isRelevant = seriesTitleParts.length === 0 || seriesTitleParts.some(part => relNameLower.includes(part));

                if (!isRelevant && !isEpisodePage) {
                    console.log(`[OpenSubtitles] Skipping irrelevant match (ad?): ${relName.trim()}`);
                    return;
                }

                console.log(`[OpenSubtitles] Found potential match: ${relName.trim()}`);
                subtitles.push({
                    id: `os-${i}-${Math.random().toString(36).substr(2, 5)}`,
                    url: directLink,
                    lang: 'ara',
                    title: relName.trim()
                });
            }
        });

        let filtered = subtitles;
        if (type === 'series' && subtitles.length > 0) {
            const sStr = season < 10 ? `0${season}` : season;
            const eStr = episode < 10 ? `0${episode}` : episode;
            const strictPattern = new RegExp(`S${sStr}E${eStr}|${season}x${episode}|${sStr}x${eStr}`, 'i');

            let tempFiltered = subtitles.filter(s => strictPattern.test(s.title));
            console.log(`[OpenSubtitles] Strict filtering (S${sStr}E${eStr}): ${tempFiltered.length} left`);

            if (tempFiltered.length === 0) {
                if (isEpisodePage && hasDirectLinks && rows.length > 0) {
                    console.log("[OpenSubtitles] No strict match but we are on a verified episode page, keeping all.");
                    filtered = subtitles;
                } else {
                    const ordinals = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
                    const seasonName = ordinals[season] || "";
                    const seasonPattern = new RegExp(`S${sStr}|Season ${season}|${seasonName} Season`, 'i');
                    filtered = subtitles.filter(s => seasonPattern.test(s.title));
                    console.log(`[OpenSubtitles] Season filtering: ${filtered.length} left`);
                }
            } else {
                filtered = tempFiltered;
            }
        }

        console.log(`[OpenSubtitles] Returning ${filtered.length} results`);
        return filtered;

    } catch (e) {
        console.error("[OpenSubtitles] Error:", e.message);
        return [];
    }
}

module.exports = {
    name: "OpenSubtitles",
    needsTitle: false,
    getSubtitles
};
