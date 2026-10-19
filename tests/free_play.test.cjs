const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('match home presents exactly three modes without hero', () => {
    const home = fs.readFileSync('templates/home.html', 'utf8');
    for (const target of [
        "matches.player_selection_page",
        "free_play.quickplay_page",
        "free_play.six_player_page"
    ]) assert.ok(home.includes(target));
    assert.doesNotMatch(home, /home-hero|Bereit für die nächste Runde/);
    assert.doesNotMatch(home, /Unsere Jassrunde|Registrierte Spieler|Gespeicherte Matches|Top 3|Zur Rangliste/);
    assert.match(home, /<h1>Match<\/h1>/);
});

test('navigation links Match to running game endpoint', () => {
    const base = fs.readFileSync('templates/base.html', 'utf8');
    assert.match(base, /href="{{ url_for\('matches.match_page'\) }}"[^>]*>[\s\S]*?<span>Match<\/span>/);
    assert.doesNotMatch(base, /<span>Ranglistenspiel<\/span>|<span>Quickplay<\/span>|<span>6er-Kreuzjass<\/span>/);
    const app = fs.readFileSync('app.py', 'utf8');
    assert.match(app, /if has_active_match\(get_game_state\(\)\):\s*return redirect\(url_for\("matches.match_page"\)\)/);
    const route = fs.readFileSync('routes/match_routes.py', 'utf8');
    assert.match(route, /"redirect_url": url_for\("home"\)/);
});

test('six-player form only has the six-player selector, preview and 420 mode', () => {
    const html = fs.readFileSync('templates/six_player_selection.html', 'utf8');
    assert.match(html, /range\(1, 4\)/);
    assert.match(html, /player_\{\{ side \}\}_\{\{ position \}\}_id/);
    assert.doesNotMatch(html, /btn-selection-mode-teams|team-selection-view|team-\{\{ side \}\}-third/);
    assert.match(html, /match-preview-card/);
    assert.match(html, /four-twenty-mode-toggle/);
    assert.doesNotMatch(html, /six-player-error|Bitte sechs unterschiedliche Spieler auswählen/);
    const js = fs.readFileSync('static/js/pages/six_player_selection.js', 'utf8');
    assert.doesNotMatch(js, /six-player-error/);
    assert.match(js, /disabled = !complete/);
});

test('six-player selection locks chosen player IDs in other five fields', () => {
    const code = fs.readFileSync('static/js/pages/six_player_selection.js', 'utf8');
    const ctx = vm.createContext({document:{addEventListener(){}}, console});
    vm.runInContext(code,ctx);
    const state = vm.runInContext('sixPlayerSelection', ctx);
    const keys = vm.runInContext('sixSelectionKeys()',ctx);
    assert.equal(keys.length,6);
    state.allPlayers = Array.from({length:6}, (_,idx) => ({id:idx+1,name:`Player ${idx+1}`}));
    for(const [index,key] of keys.entries()) {
        const fake = {
            value: String(index+1),
            options:[],
            getValue() {return this.value},
            clearOptions() {this.options=[]},
            addOption(v) {this.options.push(v)},
            refreshOptions() {},
            setValue(v) {this.value=String(v)}
        };
        state.selects.set(key,fake);
    }
    assert.equal(vm.runInContext('sixPlayerSelectionReady()',ctx),true);
    vm.runInContext('refreshSixPlayerOptions()',ctx);
    for(const [index,key] of keys.entries()) {
        const allowed=state.selects.get(key).options.map(o=>o.id);
        assert.deepEqual(allowed,[index+1]);
    }
    state.selects.get(keys[1]).value='1';
    assert.equal(vm.runInContext('sixPlayerSelectionReady()',ctx),false);
});

test('free match frontend reports result without saving', () => {
    const code = fs.readFileSync('static/js/pages/match.js','utf8');
    assert.ok(code.includes('data.saved === false'));
    assert.ok(code.includes('game?.match_saved'));
    const ctx = vm.createContext({document:{addEventListener(){},getElementById(){return null;}}});
    vm.runInContext(code,ctx);
    assert.equal(typeof ctx.renderSnakeScores,'function');
});
