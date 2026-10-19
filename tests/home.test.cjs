const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const home = fs.readFileSync('templates/home.html', 'utf8');
const styles = fs.readFileSync('static/css/style.css', 'utf8');
const source = fs.readFileSync('static/js/pages/home.js', 'utf8');

test('match landing has one accessible center-highlight picker and links to every mode', () => {
    assert.match(home, /id="mode-wheel"/);
    assert.match(home, /role="listbox"/);
    assert.match(home, /aria-activedescendant="mode-wheel-current"/);
    assert.match(home, /id="mode-wheel-current"/);
    assert.match(home, /id="mode-start"/);
    assert.match(home, /class="mode-wheel-selection-band"/);
    for (const route of [
        'matches.player_selection_page',
        'free_play.quickplay_page',
        'free_play.six_player_page'
    ]) assert.ok(home.includes(route));
    assert.ok(home.includes("js/pages/home.js"));
    assert.doesNotMatch(home, /game-mode-card|Unsere Jassrunde|Top 3|home-hero/);
    assert.match(styles, /\.mode-wheel-selection-band/);
    assert.match(styles, /touch-action:\s*pan-x/);
    assert.doesNotMatch(styles, /\.game-mode-card\s*\{/);
});

function fakeDocument() {
    const elementIds = [
        "mode-wheel", "mode-wheel-previous", "mode-wheel-current", "mode-wheel-next",
        "mode-details-description", "mode-details-title", "mode-details-meta",
        "mode-details-icon", "mode-start", "mode-previous", "mode-next"
    ];
    const elements = Object.fromEntries(elementIds.map(id => {
        const node = {
            children: [],
            listeners: {},
            attributes: {},
            textContent: "",
            href: "",
            dataset: {},
            addEventListener(name, handler) { this.listeners[name] = handler; },
            setAttribute(name, value) { this.attributes[name] = value; },
            replaceChildren(...children) { this.children = children; },
            append(...children) { this.children.push(...children); },
            fire(name, detail = {}) {
                const event = {preventDefault(){ this.defaultPrevented = true; }, ...detail};
                this.listeners[name](event);
                return event;
            }
        };
        return [id, node];
    }));
    elements["mode-wheel"].dataset = {
        rankedUrl: "/player-selection",
        quickplayUrl: "/quickplay",
        sixPlayerUrl: "/six-player"
    };
    const document = {
        getElementById(id) {return elements[id];},
        createElement(tag) {return {tag, className: "", attributes:{}, textContent: "", setAttribute(k,v){this.attributes[k]=v;}};},
        createTextNode(text) {return {textContent:text};},
        addEventListener() {}
    };
    let locationTarget = null;
    const context = vm.createContext({
        document,
        console,
        Date,
        window: {
            location: {assign(url) {locationTarget=url;}},
            setTimeout() {}
        }
    });
    vm.runInContext(source, context);
    vm.runInContext('initModePicker()', context);
    const title = () => elements["mode-details-title"].children[0]?.textContent;
    return {elements, title, selectedUrl: () => elements["mode-start"].href, navigatedTo:()=>locationTarget, context};
}

test('wheel wraps through all three modes using accessible up and down buttons', () => {
    const fixture = fakeDocument();
    const {elements, title, selectedUrl} = fixture;
    assert.equal(title(), "Ranglistenspiel ");
    assert.equal(selectedUrl(), "/player-selection");

    elements["mode-next"].fire("click");
    assert.equal(title(), "Quickplay ");
    assert.equal(selectedUrl(), "/quickplay");

    elements["mode-next"].fire("click");
    assert.equal(title(), "6er-Kreuzjass ");
    assert.equal(selectedUrl(), "/six-player");

    elements["mode-next"].fire("click");
    assert.equal(title(), "Ranglistenspiel ");
    elements["mode-previous"].fire("click");
    assert.equal(title(), "6er-Kreuzjass ");
    assert.equal(elements["mode-wheel-current"].attributes["aria-selected"], "true");
    assert.equal(elements["mode-wheel-previous"].attributes["aria-selected"], "false");
});

test('touch swipe up selects next mode and down returns to previous', () => {
    const {elements, title} = fakeDocument();
    const wheel=elements["mode-wheel"];
    wheel.fire("pointerdown", {clientY:180, pointerId:8, pointerType:"touch"});
    wheel.fire("pointerup", {clientY:95, pointerId:8, pointerType:"touch"});
    assert.equal(title(), "Quickplay ");

    wheel.fire("pointerdown", {clientY:95, pointerId:9, pointerType:"touch"});
    wheel.fire("pointerup", {clientY:180, pointerId:9, pointerType:"touch"});
    assert.equal(title(), "Ranglistenspiel ");

    wheel.fire("pointerdown", {clientY:100, pointerId:10, pointerType:"touch"});
    wheel.fire("pointerup", {clientY:98, pointerId:10, pointerType:"touch"});
    assert.equal(title(), "Ranglistenspiel ");
});

test('keyboard accessibility, wheel scroll and Enter activation', () => {
    const {elements, title, selectedUrl, navigatedTo} = fakeDocument();
    const wheel = elements["mode-wheel"];

    const key=(name)=>wheel.fire("keydown",{key:name});
    assert.equal(key("ArrowDown").defaultPrevented, true);
    assert.equal(title(), "Quickplay ");
    key("End");
    assert.equal(title(), "6er-Kreuzjass ");
    key("Home");
    assert.equal(selectedUrl(), "/player-selection");

    const evt=wheel.fire("wheel",{deltaY:100});
    assert.equal(evt.defaultPrevented, true);
    assert.equal(selectedUrl(), "/quickplay");
    key("Enter");
    assert.equal(navigatedTo(), "/quickplay");
});
