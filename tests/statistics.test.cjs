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
test('public rating is hidden during placement and unadorned once qualified', () => {
    const unplaced = ctx.ratingCell({
        glicko2:1700, rating_deviation:200, rated_matches:2, placement_required:10,
        ranking_eligible:false
    });
    assert.match(unplaced, /Placement 2\/10/);
    assert.doesNotMatch(unplaced, /1700|RD|Rang/);

    const placed = ctx.ratingCell({
        glicko2:1600, rating_deviation:65, ranking_eligible:true, rating_rank:3
    });
    assert.equal(placed, '1600');

    const teamInPlacement = ctx.ratingCell({
        glicko2:1520, rated_matches:9, placement_required:10, ranking_eligible:false
    });
    assert.match(teamInPlacement, /Placement 9\/10/);
    assert.doesNotMatch(teamInPlacement, /1520/);

    assert.match(ctx.ratingCell({rating_pending:true}), /Neuberechnung ausstehend/);
});

test('statistics include sortable 420-win columns for players and teams', () => {
    const html = fs.readFileSync('templates/statistics.html', 'utf8');
    const js = fs.readFileSync('static/js/pages/statistics.js', 'utf8');
    assert.ok(html.includes('class="text-end sortable-header" data-sort="four_twenty_wins"'));
    assert.ok(html.includes('class="text-end team-sortable-header" data-sort="four_twenty_wins"'));
    assert.ok(js.includes('formatNumber(player.four_twenty_wins)'));
    assert.ok(js.includes('formatNumber(team.four_twenty_wins)'));
    assert.ok(js.includes('colspan="8" class="text-center text-muted py-4">Keine Spieler gefunden.'));
    assert.ok(js.includes('colspan="9" class="text-center text-muted py-4">Keine Teams gefunden.'));
});
