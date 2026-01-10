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
                config.lang = jsonConfig.lang || "ara";
                config.osCount = parseInt(jsonConfig.osCount) || 5;
                config.ytsCount = parseInt(jsonConfig.ytsCount) || 3;
                config.subdlKey = jsonConfig.subdlKey || "";
                config.subsourceKey = jsonConfig.subsourceKey || "";
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
                config.subdlKey = (parts[3] === "nokey" ? "" : parts[3]) || "";
                config.subsourceKey = (parts[4] === "nokey" ? "" : parts[4]) || "";
            } else if (configStr.includes("=")) {
                const normalized = configStr.replace(/,/g, '&').replace(/\|/g, '&');
                try {
                    const params = new URLSearchParams(normalized);
                    config.lang = params.get("lang") || "ara";
                    config.osCount = parseInt(params.get("os")) || 5;
                    config.ytsCount = parseInt(params.get("yts")) || 3;
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
    let config = { lang: "ara", osCount: 5, ytsCount: 3, subdlKey: "", subsourceKey: "" };
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
        if (manifest.behaviorHints) {
            manifest.behaviorHints.configurationURL = `${domain}/configure`;
        }

        // Unique ID with version and hourly salt for cache busting
        const hourSalt = Math.floor(Date.now() / 3600000);
        const configHash = `${config.lang}_${config.osCount}_${config.ytsCount}`;
        manifest.id = `org.antigravity.arabicsubtitles.v${manifest.version.replace(/\./g, '')}h${hourSalt}.${configHash}`;

        if (config.lang !== "ara") {
            manifest.name = `Arabic Subtitles Pro (${config.lang.toUpperCase()})`;
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
    const { url, season, episode, referer, provider } = req.query;
    if (!url) return res.status(400).send("Missing URL");

    try {
        const subtitleContent = await downloadSubtitle(url, season, episode, referer, provider);
        if (!subtitleContent) return res.status(404).send("Subtitle not found");

        res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="subtitle.srt"');
        res.send(subtitleContent);

    } catch (e) {
        console.error("Proxy route error:", e.message);
        res.status(500).send("Error: " + e.message);
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

// 5. Connectivity
app.get("/ping", (req, res) => res.json({ status: "alive" }));

console.log("--> DYNAMIC PRODUCTION: Hub & Config ACTIVE <--");
const port = process.env.PORT || 7000;
app.listen(port, "0.0.0.0", () => {
    console.log(`Express Addon active on http://127.0.0.1:${port}/manifest.json`);
});
