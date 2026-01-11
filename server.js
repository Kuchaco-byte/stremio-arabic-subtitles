const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("./addon");
const { downloadSubtitle } = require("./proxy");
const fs = require("fs");
const path = require("path");

const app = express();
const router = getRouter(addonInterface);

// Enable CORS and Anti-Cache headers
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");


    // Global Anti-Cache for Subtitle JSONs and Manifest
    if (req.url.endsWith(".json") || req.url.includes("/manifest.json")) {
        res.header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.header("Pragma", "no-cache");
        res.header("Expires", "0");
    }
    next();
});

// Dashboard Routes
app.get("/configure", (req, res) => {
    const dashboardPath = path.join(__dirname, "dashboard.html");
    try {
        if (fs.existsSync(dashboardPath)) {
            const html = fs.readFileSync(dashboardPath, "utf8");
            res.setHeader("Content-Type", "text/html");
            res.send(html);
        } else {
            res.status(404).send("Dashboard file not found");
        }
    } catch (e) {
        res.status(500).send("Error reading dashboard: " + e.message);
    }
});

app.get("/:config/configure", (req, res) => {
    const dashboardPath = path.join(__dirname, "dashboard.html");
    try {
        let html = fs.readFileSync(dashboardPath, "utf8");
        // We'll let the client-side JS handle the pre-filling
        res.setHeader("Content-Type", "text/html");
        res.send(html);
    } catch (e) { res.status(500).send(e.message); }
});

app.get("/", (req, res) => res.redirect("/configure"));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

function configMiddleware(req, res, next) {
    const configStr = req.params.config;
    let config = { lang: "ara", osCount: 5, ytsCount: 3 };

    if (configStr) {
        console.log(`[Config] Parsing: ${configStr}`);
        try {
            // Priority 1: JSON Base64
            const decoded = atob(configStr);
            if (decoded.trim().startsWith('{')) {
                const jsonConfig = JSON.parse(decoded);
                config = { ...config, ...jsonConfig };
                console.log("[Config] Loaded via JSON Base64");
            } else {
                throw new Error("Not JSON");
            }
        } catch (e) {
            // Fallback: Legacy Formats
            if (configStr.includes("_")) {
                const parts = configStr.split("_");
                config.lang = parts[0] || "ara";
                config.osCount = parseInt(parts[1]) || 5;
                config.ytsCount = parseInt(parts[2]) || 3;
                config.subdlLimit = 5;
                config.subsourceLimit = 5;
                config.subdlKey = (parts[3] === "nokey" ? "" : parts[3]) || "";
                config.subsourceKey = (parts[4] === "nokey" ? "" : parts[4]) || "";
            } else if (configStr.includes("=")) {
                const normalized = configStr.replace(/,/g, '&').replace(/\|/g, '&');
                try {
                    const params = new URLSearchParams(normalized);
                    config.lang = params.get("lang") || "ara";
                    config.osCount = parseInt(params.get("os")) || 5;
                    config.ytsCount = parseInt(params.get("yts")) || 3;
                    config.subdlLimit = 5;
                    config.subsourceLimit = 5;
                } catch (e) { }
            }
        }
    }
    req.addonConfig = config;
    next();
}

// 1. Manifest Routes
app.get("/manifest.json", (req, res, next) => {
    const configStr = req.params.config; // This will be undefined for /manifest.json
    let config = { lang: "ara", osCount: 5, ytsCount: 3, subdlLimit: 5, subsourceLimit: 5, subdlKey: "", subsourceKey: "" };
    try {
        // Attempt JSON parse first if it looks like one, otherwise fallback
        if (configStr && configStr.length > 10 && !configStr.includes('_')) {
            const jsonConfig = JSON.parse(atob(configStr));
            config = { ...config, ...jsonConfig };
        } else if (configStr) {
            const parts = configStr.split("_");
            config.lang = parts[0] || "ara";
            config.osCount = parseInt(parts[1]) || 5;
            config.ytsCount = parseInt(parts[2]) || 3;
            config.subdlLimit = 5;
            config.subsourceLimit = 5;
            config.subdlKey = (parts[3] === "nokey" ? "" : parts[3]) || "";
            config.subsourceKey = (parts[4] === "nokey" ? "" : parts[4]) || "";
        }
    } catch (e) { }

    req.addonConfig = config;
    next();
}, serveManifest);

app.get("/:config/manifest.json", configMiddleware, serveManifest);

function serveManifest(req, res) {
    try {
        const manifest = JSON.parse(JSON.stringify(addonInterface.manifest));
        const config = req.addonConfig;

        const domain = `${req.protocol}://${req.get('host')}`;

        // Dynamically set logo to current host
        manifest.logo = `${domain}/logo.png`;

        if (manifest.behaviorHints) {
            // Point back to the specific config URL so the user can edit their settings from Stremio
            manifest.behaviorHints.configurationURL = `${domain}/${req.params.config}/configure`;
        }

        // Unique ID: Constant for the same config to support updates, but distinct for different languages
        // REMOVED hourSalt to ensure ID stability. ID should only change if Version or Config changes.
        const configHash = `${config.lang}_${config.osCount}_${config.ytsCount}`;
        manifest.id = `org.antigravity.stplus.v${manifest.version.replace(/\./g, '')}.${configHash}`;

        // Dynamic Name and Description
        const langCode = config.lang || "ara";
        const langNameMap = {
            "ara": "Arabic", "eng": "English", "fre": "French", "spa": "Spanish",
            "ger": "German", "ita": "Italian", "rus": "Russian", "tur": "Turkish",
            "por": "Portuguese", "dut": "Dutch", "chi": "Chinese"
        };
        const langName = langNameMap[langCode] || langCode.toUpperCase();

        manifest.name = `ST+ (${langName})`;

        // Dynamic Description
        const descriptions = {
            "ara": "الترجمات المدعومة (YTS, OS, SubDL, SubSource) - مرتبة حسب التصنيف العالمي.",
            "eng": "Supported Subs (YTS, OS, SubDL, SubSource) - Ordered by Global Ranking.",
            "fre": "Sous-titres supportés (YTS, OS, SubDL, SubSource) - Classés par rang mondial.",
            "spa": "Subtítulos soportados (YTS, OS, SubDL, SubSource) - Ordenados por ranking global.",
            "ger": "Unterstützte Untertitel (YTS, OS, SubDL, SubSource) - Sortiert nach globalem Ranking.",
            "ita": "Sottotitoli supportati (YTS, OS, SubDL, SubSource) - Ordinati per classifica globale.",
            "rus": "Поддерживаемые субтитры (YTS, OS, SubDL, SubSource) - Сортировка по мировому рейтингу.",
            "tur": "Desteklenen Altyazılar (YTS, OS, SubDL, SubSource) - Küresel Sıralamaya Göre Sıralı.",
            "por": "Legendas suportadas (YTS, OS, SubDL, SubSource) - Ordenadas por classificação global.",
            "dut": "Ondersteunde ondertitels (YTS, OS, SubDL, SubSource) - Gesorteerd op wereldwijde ranglijst.",
            "chi": "支持的字幕 (YTS, OS, SubDL, SubSource) - 按全球排名排序。"
        };
        manifest.description = descriptions[langCode] || descriptions["eng"];

        if (manifest.languages) {
            manifest.languages = [config.lang];
        }

        console.log(`[Manifest] Serving for ID: ${manifest.id}`);
        res.json(manifest);
    } catch (e) {
        console.error("Manifest error:", e.message);
        res.status(500).json({ error: e.message });
    }
}

// 2. Subtitles Routes
async function handleSubtitles(req, res) {
    const { type, id, extra } = req.params;
    const config = req.addonConfig;
    let filename = "";
    if (extra) {
        const extraPath = req.params.extra || "";
        if (extraPath.includes("filename=")) {
            filename = extraPath.split("filename=")[1].replace(".json", "");
        }
    }
    try {
        const args = { type, id, filename };
        const result = await addonInterface.getSubtitles(args, config);
        res.json(result);
    } catch (e) {
        console.error("Subtitle handler error:", e.message);
        res.status(500).json({ subtitles: [] });
    }
}

app.get("/subtitles/:type/:id.json", (req, res, next) => { req.addonConfig = { lang: "ara", osCount: 5, ytsCount: 3 }; next(); }, handleSubtitles);
app.get("/subtitles/:type/:id/:extra.json", (req, res, next) => { req.addonConfig = { lang: "ara", osCount: 5, ytsCount: 3 }; next(); }, handleSubtitles);

app.get("/:config/subtitles/:type/:id.json", configMiddleware, handleSubtitles);
app.get("/:config/subtitles/:type/:id/:extra.json", configMiddleware, handleSubtitles);

// 3. Proxy Route
app.get("/proxy/subtitle", async (req, res) => {
    const { url, season, episode, referer, provider, lang, translate } = req.query;
    if (!url) return res.status(400).send("Missing URL");

    try {
        const subtitleContent = await downloadSubtitle(url, season, episode, referer, provider, lang, translate);
        if (!subtitleContent) {
            // Return a VTT error instead of 404 text so the user sees the error in the player
            res.setHeader("Content-Type", "text/vtt; charset=utf-8");
            res.setHeader("Content-Disposition", 'attachment; filename="error.vtt"');
            res.send(`WEBVTT\n\n00:00:01.000 --> 00:00:10.000\n❌ Error: Subtitle failed to download (Source ${provider || "Unknown"} returned empty).`);
            return;
        }

        res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="subtitle.srt"');
        res.send(subtitleContent);

    } catch (e) {
        console.error("Proxy route error:", e.message);
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="error.vtt"');
        res.send(`WEBVTT\n\n00:00:01.000 --> 00:00:10.000\n❌ System Error: ${e.message}`);
    }
});

// Debug Route for SubDL Headers
app.get("/test-subdl-headers", async (req, res) => {
    try {
        const url = "https://subdl.strem.top/subtitle/tt0816692/SW50ZXJzdGVsbGFyICgyMDE0KSAgW0JsdVJheV0gW3gyNjVdICDZhtiz2K7YqSDZhdit2LPZhtipIOKdpO+4jy8yYjk0L0FSL25vSEkvbm9NYXRjaA==/3497436-8419797.srt";
        console.log("Testing SubDL URL:", url);
        const response = await axios.head(url);
        console.log("SubDL Status:", response.status);
        console.log("SubDL Headers:", response.headers);
        res.json({ status: response.status, headers: response.headers });
    } catch (e) {
        console.error("SubDL Debug Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Serve Logo
app.get("/logo.png", (req, res) => {
    const logoPath = path.join(__dirname, "logo.png");
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
    } else {
        res.status(404).send("Logo not found");
    }
});

// Serve Static VTT (Empty/Error)
app.get("/static/empty.vtt", (req, res) => {
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send("WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n❌ No subtitles found.");
});

// 5. Connectivity
app.get("/ping", (req, res) => res.json({ status: "alive" }));

console.log("--> DYNAMIC PRODUCTION: Hub & Config ACTIVE <--");
const port = process.env.PORT || 7000;
app.listen(port, "0.0.0.0", () => {
    console.log(`Express Addon active on http://127.0.0.1:${port}/manifest.json`);
});
