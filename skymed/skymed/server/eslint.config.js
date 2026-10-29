const js=require('@eslint/js');
module.exports=[{ignores:['node_modules/**','public/**','test/browser.test.js']},js.configs.recommended,{
 files:['**/*.js'],languageOptions:{ecmaVersion:2023,sourceType:'commonjs',globals:Object.fromEntries(['require','module','process','console','__dirname','Buffer','URL','setInterval','setTimeout','clearTimeout','fetch','AbortSignal'].map(k=>[k,'readonly']))},rules:{'no-unused-vars':['error',{argsIgnorePattern:'^_|^next$|^req$'}]}
}];
