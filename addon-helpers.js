const { fuzzyMatch } = require("./string-utils");

function rankSubtitles(subtitles, filename, lang = "ara") {
    if (!subtitles) return [];
    const { getDorks, getLanguageName } = require("./languages");
    const fn = filename ? filename.toLowerCase().replace(/[^a-z0-9]/g, ' ') : "";
    const langDorks = getDorks(lang);
    const displayName = getLanguageName(lang);

    return subtitles.map(sub => {
        let score = 0;
        const subTitle = (sub.title || "").toLowerCase().replace(/[^a-z0-9]/g, ' ');

        // 1. Filename Match Bonus
        if (fn) {
            const similarity = fuzzyMatch(fn, subTitle);
            score += Math.floor(similarity * 100);
        }

        // 2. Format & Quality Match
        const qualities = [
            { name: "bluray", weight: 60 },
            { name: "1080p", weight: 50 },
            { name: "720p", weight: 40 },
            { name: "web-dl", weight: 50 },
            { name: "webrip", weight: 40 },
            { name: "brrip", weight: 50 },
            { name: "remux", weight: 70 },
            { name: "uhd", weight: 60 },
            { name: "4k", weight: 60 },
            { name: "hdr", weight: 50 }
        ];

        qualities.forEach(q => {
            if (fn && fn.includes(q.name)) {
                if (subTitle.includes(q.name)) score += q.weight;
                else {
                    const lowerQualities = ["cam", "ts", "hdts", "tc", "dvdscr", "scr"];
                    lowerQualities.forEach(lq => {
                        if (subTitle.includes(lq)) score -= 100;
                    });
                }
            }
        });

        // 3. Trusted Groups
        const groups = ["yify", "psa", "rarbg", "evo", "fgt", "nitro", "tigole", "joy", "yts", "qxrd", "vxt", "utp", "pahe", "gls"];
        groups.forEach(group => {
            if (fn && fn.includes(group) && subTitle.includes(group)) score += 120;
        });

        // 4. Dorks / Relevance Keywords (Dynamic by Language)
        // Dork matching (Dynamic Strength)
        langDorks.forEach(dork => {
            if (subTitle.toLowerCase().includes(dork.toLowerCase())) {
                score += 250; // Increased priority for dorks
            }
        });

        // Exact Filename/Title Bonus
        if (subTitle.toLowerCase() === fn.toLowerCase()) score += 500;

        // Quality Tags
        if (subTitle.includes("verified")) score += 100;
        if (subTitle.includes("proper")) score += 100;
        if (subTitle.includes("retail")) score += 100;

        // English defaults for everyone (universal dorks)
        const universalDorks = ["top rated", "best", "verified", "proper", "exact", "official"];
        universalDorks.forEach(ud => {
            if (subTitle.includes(ud)) score += 80;
        });

        // 5. SOURCE BOOST: OpenSubtitles Parity
        // Since OpenSubtitles is the industry standard, we give it a reliability boost
        if (sub.source === "OpenSubtitles") score += 150;

        if (subTitle.length < 5) score -= 50;

        sub.rankScore = score;
        return sub;
    }).sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
}

function deduplicateSubtitles(subtitles) {
    if (!subtitles) return [];
    const unique = new Map();
    subtitles.forEach((sub, idx) => {
        const normTitle = (sub.originalTitle || sub.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const sizeInfo = sub.fileSize || sub.size || "";
        const providerInfo = sub.source || "";

        // If the title is too generic (e.g. just the provider tag and movie name), 
        // we use a more unique key to avoid collapsing different releases from the same provider.
        let key = `${normTitle}|${sizeInfo}`;

        // If we have a short title and no size, we append the provider and index 
        // to effectively disable deduplication for this specific provider's results 
        // unless they are absolutely identical.
        if (normTitle.length < 15 && !sizeInfo) {
            key += `|${providerInfo}|${sub.id || idx}`;
        } else {
            // Standard cross-provider deduplication
            key += `|unique`;
        }

        if (!unique.has(key)) {
            unique.set(key, sub);
        }
    });
    return Array.from(unique.values());
}

module.exports = {
    rankSubtitles,
    deduplicateSubtitles
};
