const stringSimilarity = require("string-similarity");

function fuzzyMatch(str1, str2) {
    if (!str1 || !str2) return 0;
    return stringSimilarity.compareTwoStrings(str1.toLowerCase(), str2.toLowerCase());
}

module.exports = {
    fuzzyMatch
};
