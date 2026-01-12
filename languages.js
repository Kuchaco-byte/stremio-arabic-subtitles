/**
 * Centralized Language Support for ST+ (High-Performance Version)
 * Contains localized dorks, encoding clusters, and provider-specific configurations.
 * This file serves as the "Strength Model" for all languages.
 */

const LANGUAGES = {
    "ara": {
        name: "Arabic", google: "ar", subdl: "AR", yify: "arabic", oscode: "ara",
        encodings: ["windows-1256", "iso-8859-6", "utf-8"],
        dorks: ["متوافقة", "حصري", "كاملة", "تعديل", "ضبط", "اهداء", "منقحة", "بلوراي"]
    },
    "eng": {
        name: "English", google: "en", subdl: "EN", yify: "english", oscode: "eng",
        encodings: ["utf-8", "windows-1252"],
        dorks: ["top rated", "verified", "hi", "sdh", "proper", "re-synced", "retail", "exact", "official"]
    },
    "fre": {
        name: "French", google: "fr", subdl: "FR", yify: "french", oscode: "fre",
        encodings: ["windows-1252", "iso-8859-15", "utf-8"],
        dorks: ["compatible", "complet", "officiel", "exclusif", "corrigé", "vff", "vfq", "french", "truefrench", "multi"]
    },
    "spa": {
        name: "Spanish", google: "es", subdl: "ES", yify: "spanish", oscode: "spa",
        encodings: ["windows-1252", "iso-8859-1", "utf-8"],
        dorks: ["compatible", "completo", "oficial", "exclusivo", "corregido", "castellano", "latino", "español", "spanish", "multi"]
    },
    "ger": {
        name: "German", google: "de", subdl: "DE", yify: "german", oscode: "ger",
        encodings: ["windows-1252", "iso-8859-1", "utf-8"],
        dorks: ["kompatibel", "komplett", "offiziell", "exklusiv", "korrigiert", "deutsch", "german", "multi"]
    },
    "ita": {
        name: "Italian", google: "it", subdl: "IT", yify: "italian", oscode: "ita",
        encodings: ["windows-1252", "iso-8859-1", "utf-8"],
        dorks: ["compatibile", "completo", "ufficiale", "esclusivo", "corretto", "italiano", "italian", "multi"]
    },
    "rus": {
        name: "Russian", google: "ru", subdl: "RU", yify: "russian", oscode: "rus",
        encodings: ["windows-1251", "iso-8859-5", "utf-8"],
        dorks: ["полный", "официальный", "эксклюзивный", "исправленный", "авторский", "чистый", "russian", "multi"]
    },
    "tur": {
        name: "Turkish", google: "tr", subdl: "TR", yify: "turkish", oscode: "tur",
        encodings: ["windows-1254", "iso-8859-9", "utf-8"],
        dorks: ["uyumlu", "tam", "resmi", "özel", "düzeltilmiş", "türkçe", "güncel", "turkish", "multi"]
    },
    "por": {
        name: "Portuguese", google: "pt", subdl: "PT", yify: "portuguese", oscode: "por",
        encodings: ["windows-1252", "iso-8859-1", "utf-8"],
        dorks: ["compatível", "completo", "oficial", "exclusivo", "corrigido", "br", "português", "portuguese", "multi"]
    },
    "dut": {
        name: "Dutch", google: "nl", subdl: "NL", yify: "dutch", oscode: "dut",
        encodings: ["windows-1252", "iso-8859-1", "utf-8"],
        dorks: ["geschikt", "volledig", "officieel", "exclusief", "gecorrigeerd", "nederlands", "dutch", "multi"]
    },
    "chi": {
        name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", oscode: "chi",
        encodings: ["gbk", "gb2312", "big5", "utf-8"],
        dorks: ["完整", "官方", "独家", "修正", "简繁", "双语", "中字", "chinese", "multi"]
    },
    "zho": {
        name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", oscode: "chi",
        encodings: ["gbk", "gb2312", "big5", "utf-8"],
        dorks: ["完整", "官方", "独家", "修正", "简繁", "双语", "中字", "chinese", "multi"]
    },
    "jpn": {
        name: "Japanese", google: "ja", subdl: "JA", yify: "japanese", oscode: "jpn",
        encodings: ["shift-jis", "euc-jp", "utf-8"],
        dorks: ["完全", "公式", "専売", "修正", "日本語", "japanese", "multi"]
    },
    "kor": {
        name: "Korean", google: "ko", subdl: "KO", yify: "korean", oscode: "kor",
        encodings: ["euc-kr", "utf-8"],
        dorks: ["완전", "공식", "독점", "수정", "한국어", "korean", "multi"]
    }
};

function getLanguageName(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].name) || "Multi";
}

function getGoogleCode(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].google) || null;
}

function getSubDLCode(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].subdl) || "EN";
}

function getYIFYCode(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].yify) || "english";
}

function getOSCode(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].oscode) || iso;
}

function getEncodings(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].encodings) || ["utf-8"];
}

function getDorks(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].dorks) || [];
}

module.exports = {
    LANGUAGES,
    getLanguageName,
    getGoogleCode,
    getSubDLCode,
    getYIFYCode,
    getOSCode,
    getEncodings,
    getDorks
};
