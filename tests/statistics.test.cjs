const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const elements = {};
for (const id of ['podium-card', 'podium-subtitle', ...[1,2,3].flatMap(n => [`podium-${n}`, `podium-${n}-name`, `podium-${n}-stat`])]) {
    elements[id] = { style: {}, textContent: '' };
}
const ctx = vm.createContext({document: {addEventListener() {}, getElementById(id) { return elements[id]; }}});
vm.runInContext(fs.readFileSync('static/js/pages/statistics.js', 'utf8'), ctx);
test('unplaced high ratings never outrank placed players, even ascending', () => {
    const a = {id:1, name:'A', ranking_eligible:true, rating_rank:1, glicko2:1550};
    const b = {id:2, name:'B', ranking_eligible:false, rating_rank:null, glicko2:2000};
    assert.equal(ctx.comparePublicRatings(a, b, true), -1);
    assert.equal(ctx.comparePublicRatings(a, b, false), -1);
});
test('podium uses eligible global rating ranks independently of table sort/search', () => {
    vm.runInContext(`allStatsData = [
        {id:1, name:'Placed', ranking_eligible:true, rating_rank:1, glicko2:1550},
        {id:2, name:'New', ranking_eligible:false, rating_rank:null, glicko2:2000}
    ]; currentSearchTerm = 'New'; currentSortColumn = 'wins'; currentSortAsc = true; updatePodium([]);`, ctx);
    assert.equal(elements['podium-1-name'].textContent, 'Placed');
    assert.equal(elements['podium-1-stat'].textContent, '1550');
    assert.equal(elements['podium-2'].style.visibility, 'hidden');
    assert.equal(elements['podium-3'].style.visibility, 'hidden');
});
test('placement and pending rendering are explicit', () => {
    assert.match(ctx.ratingCell({glicko2:1700, rating_deviation:200, rated_matches:9, placement_required:10}), /Placement 9\/10 · ohne Rang/);
    assert.match(ctx.ratingCell({rating_pending:true}), /Neuberechnung ausstehend/);
});
