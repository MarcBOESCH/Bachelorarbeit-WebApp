const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('home offers three clearly separated game modes', () => {
    const home = fs.readFileSync('templates/home.html', 'utf8');
    for (const target of [
        "matches.player_selection_page",
        "free_play.quickplay_page",
        "free_play.six_player_page"
    ]) {
        assert.ok(home.includes(target));
    }
    assert.match(home, /Ohne Rating/);
    assert.match(home, /6er-Kreuzjass/);
});

test('free match frontend reports session-only results', () => {
    const js = fs.readFileSync('static/js/pages/match.js', 'utf8');
    assert.ok(js.includes('data.saved === false'));
    assert.ok(js.includes('game?.match_saved'));
    // Existing snake functions remain available.
    const ctx = vm.createContext({document:{addEventListener() {},getElementById(){return null;}}});
    vm.runInContext(js, ctx);
    assert.equal(typeof ctx.renderSnakeScores, 'function');
});

test('the navigation uses Match only and opens the mode chooser', () => {
    const base = fs.readFileSync('templates/base.html', 'utf8');
    const home = fs.readFileSync('templates/home.html', 'utf8');
    assert.match(base, /href="{{ url_for\('home'\) }}"[^>]*>[\s\S]*?<span>Match<\/span>/);
    assert.doesNotMatch(base, /<span>Ranglistenspiel<\/span>|<span>Quickplay<\/span>|<span>6er-Kreuzjass<\/span>/);
    assert.doesNotMatch(home, /home-hero|Bereit für die nächste Runde/);
    assert.match(home, /<h1>Match<\/h1>/);
});

test('3v3 form offers exactly three players per team and existing duo plus third', () => {
    const html = fs.readFileSync('templates/six_player_selection.html', 'utf8');
    const js = fs.readFileSync('static/js/pages/six_player_selection.js', 'utf8');
    assert.match(html, /range\(1, 4\)/);
    assert.match(html, /id="team-\{\{ side \}\}-third"/);
    assert.match(html, /id="team-\{\{ side \}\}-select"/);
    assert.match(js, /\/api\/players/);
    assert.match(js, /\/api\/teams/);
    assert.match(js, /guest:/);
    assert.doesNotMatch(js, /method:\s*"POST"|\/api\/players"\s*,/);
    const ctx = vm.createContext({document:{addEventListener() {}}});
    vm.runInContext(js,ctx);
    assert.equal(typeof ctx.sixSelectionInfo, 'function');
    assert.equal(typeof ctx.refreshSixSelection, 'function');
});
