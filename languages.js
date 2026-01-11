/**
 * Centralized Language Support for ST+
 * Contains Names, API Codes, and Search Dorks (Relevance Keywords)
 */

const LANGUAGES = {
    "ara": { name: "Arabic", google: "ar", subdl: "AR", yify: "arabic", dorks: ["متوافقة", "حصري", "كاملة"] },
    "eng": { name: "English", google: "en", subdl: "EN", yify: "english", dorks: ["top rated", "verified", "hi", "sdh"] },
    "fre": { name: "French", google: "fr", subdl: "FR", yify: "french", dorks: ["complet", "officiel"] },
    "spa": { name: "Spanish", google: "es", subdl: "ES", yify: "spanish", dorks: ["completo", "oficial"] },
    "ger": { name: "German", google: "de", subdl: "DE", yify: "german", dorks: ["komplett", "offiziell"] },
    "ita": { name: "Italian", google: "it", subdl: "IT", yify: "italian", dorks: ["completo", "ufficiale"] },
    "rus": { name: "Russian", google: "ru", subdl: "RU", yify: "russian", dorks: ["полный"] },
    "tur": { name: "Turkish", google: "tr", subdl: "TR", yify: "turkish", dorks: ["tam"] },
    "por": { name: "Portuguese", google: "pt", subdl: "PT", yify: "portuguese", dorks: ["completo"] },
    "dut": { name: "Dutch", google: "nl", subdl: "NL", yify: "dutch", dorks: ["volledig"] },
    "chi": { name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", dorks: ["完整"] },
    "zho": { name: "Chinese", google: "zh", subdl: "ZH", yify: "chinese", dorks: ["完整"] },
    "jpn": { name: "Japanese", google: "ja", subdl: "JA", yify: "japanese", dorks: ["完全"] },
    "kor": { name: "Korean", google: "ko", subdl: "KO", yify: "korean", dorks: ["완전"] },
    "hin": { name: "Hindi", google: "hi", subdl: "HI", yify: "hindi", dorks: ["पूर्ण"] },
    "ben": { name: "Bengali", google: "bn", subdl: "BN", yify: "bengali", dorks: ["সম্পূর্ণ"] },
    "tam": { name: "Tamil", google: "ta", subdl: "TA", yify: "tamil", dorks: ["முழு"] },
    "tel": { name: "Telugu", google: "te", subdl: "TE", yify: "telugu", dorks: ["పూర్తి"] },
    "mal": { name: "Malayalam", google: "ml", subdl: "ML", yify: "malayalam", dorks: ["പൂർണ്ണ"] },
    "kan": { name: "Kannada", google: "kn", subdl: "KN", yify: "kannada", dorks: ["ಪೂರ್ಣ"] },
    "swe": { name: "Swedish", google: "sv", subdl: "SV", yify: "swedish", dorks: ["komplett"] },
    "nor": { name: "Norwegian", google: "no", subdl: "NO", yify: "norwegian", dorks: ["komplett"] },
    "fin": { name: "Finnish", google: "fi", subdl: "FI", yify: "finnish", dorks: ["täydellinen"] },
    "dan": { name: "Danish", google: "da", subdl: "DA", yify: "danish", dorks: ["komplet"] },
    "pol": { name: "Polish", google: "pl", subdl: "PL", yify: "polish", dorks: ["kompletny"] },
    "cze": { name: "Czech", google: "cs", subdl: "CS", yify: "czech", dorks: ["kompletní"] },
    "hun": { name: "Hungarian", google: "hu", subdl: "HU", yify: "hungarian", dorks: ["teljes"] },
    "rom": { name: "Romanian", google: "ro", subdl: "RO", yify: "romanian", dorks: ["complet"] },
    "gre": { name: "Greek", google: "el", subdl: "EL", yify: "greek", dorks: ["πλήρης"] },
    "heb": { name: "Hebrew", google: "iw", subdl: "HE", yify: "hebrew", dorks: ["מלא"] },
    "tha": { name: "Thai", google: "th", subdl: "TH", yify: "thai", dorks: ["สมบูรณ์"] },
    "ind": { name: "Indonesian", google: "id", subdl: "ID", yify: "indonesian", dorks: ["lengkap"] },
    "may": { name: "Malay", google: "ms", subdl: "MS", yify: "malay", dorks: ["lengkap"] },
    "vie": { name: "Vietnamese", google: "vi", subdl: "VI", yify: "vietnamese", dorks: ["hoàn thành"] }
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

function getDorks(iso) {
    return (LANGUAGES[iso] && LANGUAGES[iso].dorks) || [];
}

module.exports = {
    LANGUAGES,
    getLanguageName,
    getGoogleCode,
    getSubDLCode,
    getYIFYCode,
    getDorks
};
