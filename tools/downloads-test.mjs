// Unit test for Downloads HTTP server logic and range parsing
import assert from "node:assert/strict";

function parseRange(rangeHeader, size) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || ""));
    if (!range || (!range[1] && !range[2])) return null;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return { status: 416 };
    return { status: 206, start, end, length: end - start + 1 };
}

function verifyToken(token, urlToken) {
    return Boolean(token && urlToken && token === urlToken);
}

// 1. Full content / normal range
const r1 = parseRange("bytes=0-499", 1000);
assert.equal(r1.status, 206);
assert.equal(r1.start, 0);
assert.equal(r1.end, 499);
assert.equal(r1.length, 500);

// 2. Open-ended range (bytes=500-)
const r2 = parseRange("bytes=500-", 1000);
assert.equal(r2.status, 206);
assert.equal(r2.start, 500);
assert.equal(r2.end, 999);
assert.equal(r2.length, 500);

// 3. Suffix range (bytes=-200)
const r3 = parseRange("bytes=-200", 1000);
assert.equal(r3.status, 206);
assert.equal(r3.start, 800);
assert.equal(r3.end, 999);
assert.equal(r3.length, 200);

// 4. Invalid / unsatisfiable range (bytes=1000-1500 on 1000-byte file)
const r4 = parseRange("bytes=1000-1500", 1000);
assert.equal(r4.status, 416);

// 5. Inverted range (bytes=500-400)
const r5 = parseRange("bytes=500-400", 1000);
assert.equal(r5.status, 416);

// 6. Token verification
assert.equal(verifyToken("secret123", "secret123"), true);
assert.equal(verifyToken("secret123", "wrongtoken"), false);
assert.equal(verifyToken("secret123", null), false);
assert.equal(verifyToken("secret123", ""), false);

console.log("PASS downloads range parsing and authentication tests pass");
