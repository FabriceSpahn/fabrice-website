parcelRequire=function(e,r,t,n){var i,o="function"==typeof parcelRequire&&parcelRequire,u="function"==typeof require&&require;function f(t,n){if(!r[t]){if(!e[t]){var i="function"==typeof parcelRequire&&parcelRequire;if(!n&&i)return i(t,!0);if(o)return o(t,!0);if(u&&"string"==typeof t)return u(t);var c=new Error("Cannot find module '"+t+"'");throw c.code="MODULE_NOT_FOUND",c}p.resolve=function(r){return e[t][1][r]||r},p.cache={};var l=r[t]=new f.Module(t);e[t][0].call(l.exports,p,l,l.exports,this)}return r[t].exports;function p(e){return f(p.resolve(e))}}f.isParcelRequire=!0,f.Module=function(e){this.id=e,this.bundle=f,this.exports={}},f.modules=e,f.cache=r,f.parent=o,f.register=function(r,t){e[r]=[function(e,r){r.exports=t},{}]};for(var c=0;c<t.length;c++)try{f(t[c])}catch(e){i||(i=e)}if(t.length){var l=f(t[t.length-1]);"object"==typeof exports&&"undefined"!=typeof module?module.exports=l:"function"==typeof define&&define.amd?define(function(){return l}):n&&(this[n]=l)}if(parcelRequire=f,i)throw i;return f}({"d6sW":[function(require,module,exports) {
var e=document.getElementById("one"),n=document.getElementById("second"),l=document.getElementById("third"),t=document.getElementById("toggleOne"),o=document.getElementById("toggleTwo"),y=document.getElementById("toggleThree");function s(){var e=document.getElementById("myInput");e.select(),e.setSelectionRange(0,99999),navigator.clipboard.writeText(e.value),document.getElementById("myTooltip").innerHTML="Copied"}function d(){document.getElementById("myTooltip").innerHTML="Copy to clipboard"}t.onclick=function(){"none"===e.style.display?(e.style.display="block",n.style.display="none",l.style.display="none"):(e.style.display="none",n.style.display="none",l.style.display="none")},o.onclick=function(){"none"===n.style.display?(e.style.display="none",n.style.display="block",l.style.display="none"):(e.style.display="none",n.style.display="none",l.style.display="none")},y.onclick=function(){"none"===l.style.display?(e.style.display="none",n.style.display="none",l.style.display="block"):(e.style.display="none",n.style.display="none",l.style.display="none")};
},{}]},{},["d6sW"], null)
//# sourceMappingURL=main.aa0d92da.js.map