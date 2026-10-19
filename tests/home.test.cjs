const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const home = fs.readFileSync('templates/home.html', 'utf8');
const styles = fs.readFileSync('static/css/style.css', 'utf8');
const source = fs.readFileSync('static/js/pages/home.js', 'utf8');

test('match landing shows compact vertical carousel with three distinct cards', () => {
    assert.match(home, /id="mode-wheel"/);
    assert.match(home, /role="listbox"/);
    assert.match(home, /aria-activedescendant="mode-wheel-current"/);
    assert.match(home, /id="mode-wheel-current"/);
    assert.match(home, /id="mode-start"/);
    for(const id of ['previous','current','next']) {
        assert.ok(home.includes(`id="mode-wheel-${id}"`));
    }
    for (const route of [
        'matches.player_selection_page',
        'free_play.quickplay_page',
        'free_play.six_player_page'
    ]) assert.ok(home.includes(route));

    assert.ok(home.includes('js/pages/home.js'));
    assert.doesNotMatch(home, /mode-wheel-selection-band|game-mode-card|Unsere Jassrunde|Top 3|home-hero/);
    assert.match(styles, /\.mode-wheel-option\s*\{[^}]*border: 1px solid/);
    assert.match(styles, /\.mode-wheel-active\s*\{[^}]*background:/);
    assert.match(styles, /\.mode-wheel-neighbor\s*\{[^}]*opacity:/);
    assert.match(styles, /width: min\(100%, 300px\)/);
    assert.match(styles, /touch-action:\s*pan-x/);
    assert.doesNotMatch(styles, /\.mode-wheel-selection-band|\.game-mode-card\s*\{/);
});

function fakeElement(id) {
    return {
        id, children: [], listeners: {}, attributes: {}, textContent: '',
        href: '', dataset: {}, className: '',
        addEventListener(name, handler) { this.listeners[name] = handler; },
        setAttribute(name, value) {this.attributes[name] = value;},
        replaceChildren(...children) { this.children = children; },
        append(...children) { this.children.push(...children); },
        fire(name, detail = {}) {
            const event = {preventDefault(){ this.defaultPrevented = true; }, ...detail};
            this.listeners[name](event);
            return event;
        }
    };
}

function fakeDocument() {
    const ids = [
        'mode-wheel','mode-wheel-previous','mode-wheel-current','mode-wheel-next',
        'mode-details-description','mode-start','mode-previous','mode-next'
    ];
    const elements = Object.fromEntries(ids.map(id => [id, fakeElement(id)]));
    elements['mode-wheel'].dataset = {
        rankedUrl:'/player-selection',
        quickplayUrl:'/quickplay',
        sixPlayerUrl:'/six-player'
    };

    const document = {
        getElementById(id) {return elements[id];},
        createElement(tag) {return fakeElement(tag);},
        createTextNode(text) {return {textContent:text};},
        addEventListener() {}
    };

    let navigated = null;
    const context = vm.createContext({
        document, console, Date,
        window:{location:{assign(url){navigated=url;}},setTimeout(){}}
    });
    vm.runInContext(source, context);
    vm.runInContext('initModePicker()', context);

    const title = () => elements['mode-wheel-current'].children[1].children[0].textContent;
    const subtitle = () => elements['mode-wheel-current'].children[1].children[1].textContent;
    return {elements, title, subtitle, selectedUrl:()=>elements['mode-start'].href,
        navigatedTo:()=>navigated};
}

test('center card and Weiter link stay in sync for all three modes', () => {
    const {elements,title,subtitle,selectedUrl} = fakeDocument();
    assert.equal(title(),'Ranglistenspiel');
    assert.equal(subtitle(),'2 gegen 2 · Mit Rating');
    assert.equal(selectedUrl(),'/player-selection');

    elements['mode-next'].fire('click');
    assert.equal(title(),'Quickplay');
    assert.equal(selectedUrl(),'/quickplay');

    elements['mode-next'].fire('click');
    assert.equal(title(),'6er-Kreuzjass');
    assert.equal(subtitle(),'3 gegen 3 · Freizeit');
    assert.equal(selectedUrl(),'/six-player');

    elements['mode-next'].fire('click');
    assert.equal(title(),'Ranglistenspiel');
    elements['mode-previous'].fire('click');
    assert.equal(title(),'6er-Kreuzjass');

    for(const node of ['previous','next']) {
        assert.equal(elements[`mode-wheel-${node}`].attributes['aria-selected'],'false');
        assert.equal(elements['mode-wheel-current'].attributes['aria-selected'],'true');
    }
});

test('click on neighboring cards changes the selected mode', () => {
    const {elements,title} = fakeDocument();
    elements['mode-wheel-previous'].fire('click');
    assert.equal(title(),'6er-Kreuzjass');
    elements['mode-wheel-next'].fire('click');
    assert.equal(title(),'Ranglistenspiel');
});

test('touch swipe up and down change the card in the center', () => {
    const {elements,title} = fakeDocument();
    const wheel=elements['mode-wheel'];
    wheel.fire('pointerdown',{clientY:180,pointerId:8,pointerType:'touch'});
    wheel.fire('pointerup',{clientY:95,pointerId:8,pointerType:'touch'});
    assert.equal(title(),'Quickplay');

    wheel.fire('pointerdown',{clientY:95,pointerId:9,pointerType:'touch'});
    wheel.fire('pointerup',{clientY:180,pointerId:9,pointerType:'touch'});
    assert.equal(title(),'Ranglistenspiel');

    wheel.fire('pointerdown',{clientY:100,pointerId:10,pointerType:'touch'});
    wheel.fire('pointerup',{clientY:98,pointerId:10,pointerType:'touch'});
    assert.equal(title(),'Ranglistenspiel');
});

test('keyboard arrows, scroll and Enter activate the correct mode', () => {
    const {elements,title,selectedUrl,navigatedTo} = fakeDocument();
    const wheel=elements['mode-wheel'];
    const key = code=>wheel.fire('keydown',{key:code});
    assert.equal(key('ArrowDown').defaultPrevented,true);
    assert.equal(title(),'Quickplay');
    key('End');
    assert.equal(title(),'6er-Kreuzjass');
    key('Home');
    assert.equal(selectedUrl(),'/player-selection');

    const evt=wheel.fire('wheel',{deltaY:100});
    assert.equal(evt.defaultPrevented,true);
    assert.equal(selectedUrl(),'/quickplay');
    key('Enter');
    assert.equal(navigatedTo(),'/quickplay');
});
