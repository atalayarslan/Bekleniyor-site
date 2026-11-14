// Galibiyet listesi denemesi (sahte KV): sadece Google hesapları sayılır, botlar sayılmaz, liste galibiyete göre sıralı.
// Çalıştırma: node test/galibiyet.test.mjs
import assert from "node:assert";
import { galibiyetYaz, galibiyetleriVer } from "../src/galibiyet.js";

const depo = new Map();
const env = { MEDYA: {
  get: async (a, s) => { const v = depo.get(a); return v == null ? null : s && s.type === "json" ? JSON.parse(v) : v; },
  put: async (a, v) => { depo.set(a, v); }
} };

await galibiyetYaz(env, "bilardo", [
  { kim: "u:ali", ad: "Ali", kazandi: true }, { kim: "bot:1", ad: "Bot", kazandi: false },
  { kim: "u:veli", ad: "Veli", foto: "https://kotu.example/x.png", kazandi: false }, null
]);
await galibiyetYaz(env, "okey", [{ kim: "u:veli", ad: "Veli", kazandi: true }, { kim: "u:ali", ad: "Ali", kazandi: false }]);
await galibiyetYaz(env, "okey", [{ kim: "u:veli", ad: "Veli", kazandi: true }, { kim: "m:misafir", ad: "Misafir", kazandi: false }]);

const { liste } = await galibiyetleriVer(env);
assert.deepStrictEqual(liste.map((s) => [s.ad, s.okey, s.bilardo, s.oyun]), [["Veli", 2, 0, 3], ["Ali", 0, 1, 2]]);
assert.strictEqual(liste[0].foto, "", "Google dışı fotoğraf adresi kabul edilmemeli");
assert.ok(!JSON.stringify(JSON.parse(depo.get("galibiyetler"))).includes("Bot"), "botlar sayılmamalı");
assert.ok(!depo.get("galibiyetler").includes("Misafir"), "canlıda misafir sayılmamalı");
// KV yoksa sessizce geçer
await galibiyetYaz({}, "okey", [{ kim: "u:x", ad: "X", kazandi: true }]);
console.log("galibiyet: tamam");
