const express = require("express");
const { getLanguageName } = require("./languages");
const addonInterface = require("./addon");
const { downloadSubtitle } = require("./proxy");
const fs = require("fs");
const path = require("path");

const app = express();

/**
 * 1. UNIVERSAL CORS & PNA (CLOUD READY)
 */
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Private-Network", "true");
    res.header("Access-Control-Max-Age", "86400");

    if (req.method === 'OPTIONS') {
        return res.status(200).send("OK");
    }
    next();
});

// 2. LOGGING
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.log(`[${time}] ${req.method} ${req.url}`);
    next();
});

// 3. STATIC ASSETS & DASHBOARD
app.use(express.static(__dirname));

function serveDashboard(req, res) {
    try {
        const p = path.resolve(__dirname, "dashboard.html");
        if (fs.existsSync(p)) {
            const html = fs.readFileSync(p, "utf8");
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(html);
        }
        res.status(404).send("Error: dashboard.html not found.");
    } catch (e) {
        res.status(500).send("Internal Error: " + e.message);
    }
}

app.get("/configure", serveDashboard);
app.get("/:config/configure", serveDashboard);
app.get("/", (req, res) => res.redirect("/configure"));

// 4. MANIFEST LOGIC (DYNAMIC HOST DETECTION)
function configMiddleware(req, res, next) {
    let configStr = req.params.config;
    let config = { lang: "eng", osCount: 15, ytsCount: 5, subdlLimit: 15, subsourceLimit: 15, autoTranslate: true };

    if (configStr) {
        try {
            const normalized = configStr.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = Buffer.from(normalized, 'base64').toString('utf8');
            if (decoded.trim().startsWith('{')) {
                config = { ...config, ...JSON.parse(decoded) };
            }
        } catch (e) { }
    }
    req.addonConfig = config;
    next();
}

function serveManifest(req, res) {
    try {
        const manifest = JSON.parse(JSON.stringify(addonInterface.manifest));
        const config = req.addonConfig || { lang: "ara" };

        // --- DYNAMIC DOMAIN DETECTION ---
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const domain = `${protocol}://${host}`;

        const activeLang = getLanguageName(config.lang);

        // Dynamic Manifest Branding
        manifest.id = `org.stplus.cloud.v1.${config.lang}`; // DYNAMIC ID TO BYPASS CACHE
        manifest.name = `ST+ ${activeLang}`;
        manifest.description = `Multi-provider ${activeLang} subtitles`;

        // Ensure relative paths are converted to absolute for Stremio
        manifest.logo = `${domain}/logo.png`;

        // URL-SAFE Base64 Configuration
        const configJson = JSON.stringify(config);
        const configBase64 = Buffer.from(configJson).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        manifest.behaviorHints.configurationURL = `${domain}/${configBase64}/configure`;

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.status(200).json(manifest);
    } catch (e) {
        res.status(500).json({ error: "Manifest generation failed: " + e.message });
    }
}

app.get("/manifest.json", serveManifest);
app.get("/:config/manifest.json", configMiddleware, serveManifest);

// 5. SUBTITLES
async function handleSubtitles(req, res) {
    const { type, id, extra } = req.params;
    const config = req.addonConfig || { lang: "eng", osCount: 15, ytsCount: 5, subdlLimit: 15, subsourceLimit: 15, autoTranslate: true };

    let filename = "";
    if (extra && extra.includes("filename=")) {
        filename = extra.split("filename=")[1].replace(".json", "");
    }

    try {
        // Pass dynamic domain as baseUrl to addon
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const domain = `${protocol}://${req.get('host')}`;

        const result = await addonInterface.getSubtitles({ type, id, filename }, { ...config, baseUrl: domain });
        res.json(result || { subtitles: [] });
    } catch (e) {
        console.error("[Server] Subtitle error:", e.message);
        res.json({ subtitles: [] });
    }
}

app.get("/subtitles/:type/:id.json", handleSubtitles);
app.get("/subtitles/:type/:id/:extra.json", handleSubtitles);
app.get("/:config/subtitles/:type/:id.json", configMiddleware, handleSubtitles);
app.get("/:config/subtitles/:type/:id/:extra.json", configMiddleware, handleSubtitles);

// 6. PROXY
app.get("/proxy/subtitle", async (req, res) => {
    const { url, season, episode, referer, provider, lang, translate } = req.query;
    if (!url) return res.status(400).send("Missing URL");
    try {
        const content = await downloadSubtitle(url, season, episode, referer, provider, lang, translate);
        if (!content) throw new Error("Empty content");
        res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
        res.send(content);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// 7. START SERVER (Cloud Compatible)
const port = process.env.PORT || 7000;
app.listen(port, "0.0.0.0", () => {
    console.log(`\n🚀 ST+ CLOUD-READY SERVER LIVE ON PORT ${port}`);
    console.log(`🔗 MANIFEST: /manifest.json`);
});
