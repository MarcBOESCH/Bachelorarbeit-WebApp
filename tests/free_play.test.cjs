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
