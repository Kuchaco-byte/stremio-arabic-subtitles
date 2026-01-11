/**
 * Centralized Language Support for ST+
 * Contains Names, API Codes, Encoding Rules, and Search Dorks (Relevance Keywords)
 */

const LANGUAGES = {
    "ara": {
        name: "Arabic", google: "ar", subdl: "AR", yify: "arabic", oscode: "ara",
        encodings: ["windows-1256", "iso-8859-6"],
        dorks: ["متوافقة", "حصري", "كاملة", "تعديل", "ضبط"]
    },
    "eng": {
        name: "English", google: "en", subdl: "EN", yify: "english", oscode: "eng",
        encodings: ["utf-8"],
        dorks: ["top rated", "verified", "hi", "sdh", "proper", "re-synced"]
    },
    "fre": {
        name: "French", google: "fr", subdl: "FR", yify: "french", oscode: "fre",
        encodings: ["windows-1252", "iso-8859-15"],
        dorks: ["compatible", "complet", "officiel", "exclusif", "corrigé"]
    },
    "spa": {
        name: "Spanish", google: "es", subdl: "ES", yify: "spanish", oscode: "spa",
        encodings: ["windows-1252", "iso-8859-1"],
        dorks: ["compatible", "completo", "oficial", "exclusivo", "corregido"]
    },
    "ger": {
        name: "German", google: "de", subdl: "DE", yify: "german", oscode: "ger",
        encodings: ["windows-1252", "iso-8859-1"],
        dorks: ["kompatibel", "komplett", "offiziell", "exklusiv", "korrigiert"]
    },
    "ita": {
        name: "Italian", google: "it", subdl: "IT", yify: "italian", oscode: "ita",
        encodings: ["windows-1252", "iso-8859-1"],
        dorks: ["compatibile", "completo", "ufficiale", "esclusivo", "corretto"]
    },
    "rus": {
        name: "Russian", google: "ru", subdl: "RU", yify: "russian", oscode: "rus",
        encodings: ["windows-1251", "iso-8859-5"],
        dorks: ["полный", "официальный", "эксклюзивный", "исправленный"]
    },
    "tur": {
        name: "Turkish", google: "tr", subdl: "TR", yify: "turkish", oscode: "tur",
        encodings: ["windows-1254", "iso-8859-9"],
        dorks: ["uyumlu", "tam", "resmi", "özel", "düzeltilmiş"]
    },
    "por": {
        name: "Portuguese", google: "pt", subdl: "PT", yify: "portuguese", oscode: "por",
        encodings: ["windows-1252", "iso-8859-1"],
        dorks: ["compatível", "completo", "oficial", "exclusivo", "corrigido"]
    },
    "dut": {
        name: "Dutch", google: "nl", subdl: "NL", yify: "dutch", oscode: "dut",
        encodings: ["windows-1252", "iso-8859-1"],
        dorks: ["geschikt", "volledig", "officieel", "exclusief", "gecorrigeerd"]
    },
    "chi": {
        name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", oscode: "chi",
        encodings: ["gbk", "big5", "utf-8"],
        dorks: ["完整", "官方", "独家", "修正"]
    },
    "zho": {
        name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", oscode: "chi",
        encodings: ["gbk", "big5", "utf-8"],
        dorks: ["完整", "官方", "独家", "修正"]
    },
    "jpn": {
        name: "Japanese", google: "ja", subdl: "JA", yify: "japanese", oscode: "jpn",
        encodings: ["shift-jis", "euc-jp", "utf-8"],
        dorks: ["完全", "公式", "専売", "修正"]
    },
    "kor": {
        name: "Korean", google: "ko", subdl: "KO", yify: "korean", oscode: "kor",
        encodings: ["euc-kr", "utf-8"],
        dorks: ["완전", "공식", "독점", "수정"]
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
