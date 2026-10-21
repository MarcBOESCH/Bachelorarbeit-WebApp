const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('static/js/pages/match.js', 'utf8');
const template = fs.readFileSync('templates/match.html', 'utf8');
const styles = fs.readFileSync('static/css/style.css', 'utf8');

test('score toggles stack, and rematch appears beside new game in all modes', () => {
    assert.match(styles, /\.score-entry-options\s*\{[^}]*flex-direction:\s*column/);
    assert.match(styles, /\.match-summary-actions\s*\{[^}]*gap:\s*12px/);
    assert.match(template, /id="double-points-toggle"/);
    assert.match(template, /id="quickplay-420-toggle"/);
    assert.match(template, /id="rematch-btn"/);
    assert.match(template, /id="reset-btn"/);
    assert.match(template, /id="confirm-game-action-message"/);
    assert.match(template, /id="team-name-input-a"/);
    assert.match(template, /class="team-name-trigger" id="team-name-a"/);
    assert.match(template, /class="team-name-trigger" id="team-name-b"/);
    assert.doesNotMatch(template, /team-name-edit-btn/);
    const rematchButton = template.match(/<button id="rematch-btn"[\s\S]*?<\/button>/)?.[0] || "";
    assert.doesNotMatch(rematchButton, /bi-arrow-repeat|<i\b/);
    assert.match(styles, /\.team-name-trigger:focus-visible/);
    assert.match(template, /id="team-name-input-b"/);
    assert.match(template, /data-team="A"/);
    assert.match(template, /data-team="B"/);
});

function makeElement(name) {
    const flags = new Set(['d-none']);
    return {
        name, dataset: {}, textContent: '', value: '',
        disabled: false, listeners: {},
        classList: {
            contains(v) {return flags.has(v);},
            add(v) {flags.add(v);},
            remove(v) {flags.delete(v);}
        },
        addEventListener(event, handler) {this.listeners[event] = handler;},
        fire(event, props = {}) {
            const e = {key: '', preventDefault() {}, ...props};
            this.listeners[event](e);
        },
        focus() {this.focused = true;},
        select() {this.selected = true;}
    };
}

// Async handlers cross a VM boundary; a full event-loop turn is more
// reliable than awaiting an arbitrary number of Promise microtasks.
async function flushUiActions() {
    await new Promise(resolve => setImmediate(resolve));
}

function uiFixture() {
    const ids = [
        'reset-btn','rematch-btn','confirm-new-game-btn','confirmNewGameModal',
        'confirmNewGameModalLabel','confirm-game-action-message',
        'team-name-a','team-name-b','team-name-input-a','team-name-input-b'
    ];
    const nodes = Object.fromEntries(ids.map(id=>[id,makeElement(id)]));
    nodes['team-name-a'].textContent='Team A';
    nodes['team-name-b'].textContent='Team B';

    const editors = ['A','B'].map(team=>{
        const editor = makeElement('editor-'+team);
        editor.dataset.team=team;
        const label = nodes[`team-name-${team.toLowerCase()}`];
        label.parentElement = makeElement('heading-'+team);
        label.parentElement.classList.remove('d-none');
        return editor;
    });
    const document = {
        getElementById(id) {return nodes[id] || null;},
        querySelectorAll(selector) {
            return selector === '.team-name-editor' ? editors : [];
        },
        addEventListener() {}
    };
    let modalShows = 0;
    let modalHides = 0;
    const bootstrap = {
        Modal: class {
            show(){modalShows++;}
            hide(){modalHides++;}
        }
    };
    const window = {location: {href:''}};
    const calls=[];
    const ctx = vm.createContext({document,bootstrap,window,console,
        showToast() {}});
    vm.runInContext(source,ctx);
    ctx.sendAction = async function(payload) {
        calls.push(payload);
        if (payload.action === 'rename_team') {
            return {team_name_a:payload.team === 'A' ? payload.name : 'Team A',
                team_name_b:payload.team === 'B' ? payload.name : 'Team B'};
        }
        return {redirect_url:payload.action === 'rematch' ? '/match' : '/home'};
    };
    return {nodes,editors,ctx,calls,window,shown:()=>modalShows,hidden:()=>modalHides};
}

test('unfinished rematch asks for confirmation, then returns to scoring', async () => {
    const f=uiFixture();
    vm.runInContext('initNewGameButton()',f.ctx);
    f.nodes['rematch-btn'].fire('click');
    assert.equal(f.shown(),1);
    assert.equal(f.nodes['confirmNewGameModalLabel'].textContent,'Rematch starten');
    assert.match(f.nodes['confirm-game-action-message'].textContent,/denselben Teams/);
    assert.equal(f.calls.length,0);
    f.nodes['confirm-new-game-btn'].fire('click');
    await flushUiActions();
    assert.equal(f.hidden(),1);
    assert.equal(f.calls[0].action,'rematch');
    assert.equal(f.window.location.href,'/match');
});

test('finished match rematches immediately, new game goes to mode selection', async () => {
    const first=uiFixture();
    vm.runInContext('matchFinished = true; initNewGameButton()',first.ctx);
    first.nodes['rematch-btn'].fire('click');
    await flushUiActions();
    assert.equal(first.shown(),0);
    assert.equal(first.calls[0].action,'rematch');
    assert.equal(first.window.location.href,'/match');

    const second=uiFixture();
    vm.runInContext('matchFinished = true; initNewGameButton()',second.ctx);
    second.nodes['reset-btn'].fire('click');
    await flushUiActions();
    assert.equal(second.calls[0].action,'new_game');
    assert.equal(second.window.location.href,'/home');
});

test('clicking team name and Enter persists Quickplay name in the current session', async () => {
    const f=uiFixture();
    vm.runInContext('initEditableTeamNames()',f.ctx);
    const name=f.nodes['team-name-a'],input=f.nodes['team-name-input-a'];
    name.fire('click');
    assert.equal(input.value,'Team A');
    assert.equal(input.focused,true);
    assert.equal(name.parentElement.classList.contains('d-none'),true);
    input.value='Meine Freunde';
    input.fire('keydown',{key:'Enter'});
    await flushUiActions();
    // VM-realm objects have different prototypes; compare their public values.
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),
        {action:'rename_team',team:'A',name:'Meine Freunde'});
    assert.equal(name.textContent,'Meine Freunde');
    assert.equal(name.parentElement.classList.contains('d-none'),false);
});

test('Escape cancels name change and restores the clickable title', () => {
    const f = uiFixture();
    vm.runInContext('initEditableTeamNames()', f.ctx);
    const label = f.nodes['team-name-b'];
    const input = f.nodes['team-name-input-b'];
    label.fire('click');
    input.value = 'Nicht speichern';
    input.fire('keydown', {key:'Escape'});
    assert.equal(f.calls.length, 0);
    assert.equal(label.parentElement.classList.contains('d-none'), false);
    assert.equal(input.classList.contains('d-none'), true);
    assert.equal(input.value, 'Team B');
    assert.equal(label.focused, true);
});

test('finished free-game name is not editable when the trigger is disabled', () => {
    const f = uiFixture();
    vm.runInContext('initEditableTeamNames()', f.ctx);
    const label = f.nodes['team-name-a'];
    label.disabled = true;
    label.fire('click');
    assert.equal(f.nodes['team-name-input-a'].classList.contains('d-none'), true);
    assert.equal(f.calls.length, 0);
});
