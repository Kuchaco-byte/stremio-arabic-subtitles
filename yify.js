const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://yts-subs.com";

async function getSubtitles(type, imdbId, title, season, episode, lang = "ara") {
    if (type !== 'movie') return [];

    const langMap = {
        "ara": "arabic",
        "eng": "english",
        "fre": "french",
        "spa": "spanish"
    };
    const targetLang = langMap[lang] || "arabic"; // Default to arabic if code not found

    console.log(`YTS-Subs searching for: ${imdbId} | Lang: ${targetLang}`);

    try {
        const url = `${BASE_URL}/movie-imdb/${imdbId}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://www.google.com/'
            },
            validateStatus: false
        });
        if (response.status !== 200) return [];

        const $ = cheerio.load(response.data);
        const subtitles = [];

        const rows = $('.table-responsive table tbody tr');

        rows.each((i, el) => {
            const langText = $(el).find('.flag-cell .sub-lang').text().trim().toLowerCase();

            if (langText.includes(targetLang)) {
                const detailLink = $(el).find('.download-cell a').attr('href');
                const name = $(el).find('a').first().text().trim();
                const rating = $(el).find('.rating-cell').text().trim();

                if (detailLink) {
                    subtitles.push({
                        tempUrl: `${BASE_URL}${detailLink.startsWith('/') ? detailLink : '/' + detailLink}`,
                        title: `${name} (${rating})`,
                        lang: lang
                    });
                }
            }
        });

        // Resolve first 3
        const finalSubs = await Promise.all(subtitles.slice(0, 3).map(async (sub, idx) => {
            try {
                const res = await axios.get(sub.tempUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                const $d = cheerio.load(res.data);
                const downloadBtn = $d('a.download-subtitle');
                let zipLink = downloadBtn.attr('href');
                const dataLink = downloadBtn.attr('data-link');

                if (dataLink) {
                    zipLink = Buffer.from(dataLink, 'base64').toString('utf-8');
                }

                if (zipLink) {
                    const fullUrl = zipLink.startsWith('http') ? zipLink : BASE_URL + zipLink;
                    return {
                        id: `yts-${idx}-${imdbId}`,
                        url: fullUrl,
                        lang: lang,
                        title: sub.title,
                        referer: sub.tempUrl
                    };
                }
            } catch (e) {
                console.error(`[YTS] Error resolving subtitle ${idx}:`, e.message);
                return null;
            }
        }));

        return finalSubs.filter(Boolean);

    } catch (e) {
        console.error("YTS error:", e.message);
        return [];
    }
}

module.exports = {
    name: "YTS",
    needsTitle: false,
    getSubtitles
};
