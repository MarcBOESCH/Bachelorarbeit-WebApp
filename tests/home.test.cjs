const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('templates/home.html', 'utf8');
const css = fs.readFileSync('static/css/style.css', 'utf8');
const source = fs.readFileSync('static/js/pages/home.js', 'utf8');

test('horizontal carousel shows tall illustration cards in Quickplay / 2v2 / 3v3 order', () => {
    assert.match(html, /id="mode-carousel"/);
    assert.match(html, /aria-orientation="horizontal"/);
    assert.match(html, /aria-activedescendant="mode-card-0"/);
    for (let i = 0; i < 3; i++) {
        assert.match(html, new RegExp(`id="mode-card-${i}"`));
        assert.match(html, new RegExp(`data-mode-index="${i}"`));
    }
    assert.match(css, /scroll-snap-type:\s*x mandatory/);
    assert.match(css, /scroll-snap-align:\s*center/);
    assert.match(css, /overflow-x:\s*auto/);
    assert.match(css, /touch-action:\s*pan-x/);
    assert.match(css, /\.mode-carousel-card\s*\{[^}]*height:\s*390px/);
    assert.match(css, /\.mode-carousel-card\.is-active/);
    assert.match(css, /\.mode-card-art--quickplay/);
    assert.match(css, /\.mode-card-art--ranked/);
    assert.match(css, /\.mode-card-art--six/);
    assert.match(html, /mode-card-art/);
    assert.match(html, /mode-card-footer/);
    assert.doesNotMatch(html, /mode-carousel-controls/);
    assert.match(html, /Karte antippen zum Öffnen/);
    assert.ok(html.indexOf('id="mode-previous"') < html.indexOf('id="mode-carousel"'));
    assert.ok(html.indexOf('id="mode-next"') > html.indexOf('id="mode-card-2"'));
    assert.match(html, /Karte antippen/);
    assert.match(css, /container-type:\s*inline-size/);
    assert.match(css, /grid-template-columns:\s*46px minmax\(0, 1fr\) 46px/);
    assert.match(css, /mode-art-players/);
    const sixCard = html.split('id="mode-card-2"')[1].split('</div>')[0];
    const sixIllustration = html.split('mode-card-art--six')[1].split('</span>')[1];
    assert.equal((sixIllustration.match(/bi-person-fill/g) || []).length, 3);
    const first = html.indexOf('class="mode-carousel-card mode-card--quickplay');
    const second = html.indexOf('class="mode-carousel-card mode-card--ranked');
    const third = html.indexOf('class="mode-carousel-card mode-card--six');
    assert.ok(first >= 0 && first < second && second < third);
    assert.match(html, /id="mode-card-0"[^>]*is-active/);
    assert.match(html, /Weiter zu Quickplay/);
    assert.doesNotMatch(html, /mode-wheel|home-hero|Unsere Jassrunde|Top 3/);
    assert.doesNotMatch(css, /\.mode-wheel\s*\{/);

    for (const route of [
        'matches.player_selection_page',
        'free_play.quickplay_page',
        'free_play.six_player_page'
    ]) assert.ok(html.includes(route));
});

function fakeElement(id) {
    const classNames = new Set();
    return {
        id, listeners: {}, attributes: {}, children: [], dataset: {},
        textContent: '', className: '', href: '', disabled: false,
        classList: {
            contains(name) {return classNames.has(name);},
            toggle(name, active) {
                if(active) classNames.add(name); else classNames.delete(name);
            }
        },
        addEventListener(name, callback) {this.listeners[name] = callback;},
        setAttribute(name, value) {this.attributes[name] = value;},
        removeAttribute(name) {delete this.attributes[name];},
        append(...parts) {this.children.push(...parts);},
        replaceChildren(...parts) {this.children = parts;},
        fire(name, properties = {}) {
            const event = {
                ...properties, defaultPrevented: false,
                preventDefault() {this.defaultPrevented = true;}
            };
            this.listeners[name](event);
            return event;
        }
    };
}

function fixture() {
    const ids = ['mode-carousel', 'mode-previous', 'mode-next',
        'mode-details-description', 'mode-start',
        'mode-card-0', 'mode-card-1', 'mode-card-2'
    ];
    const nodes = Object.fromEntries(ids.map(id=>[id,fakeElement(id)]));
    const cards = [nodes['mode-card-0'], nodes['mode-card-1'],nodes['mode-card-2']];
    const dots = [0,1,2].map(i=>{
        const dot=fakeElement(`dot-${i}`);
        dot.dataset.modeTarget=String(i);
        return dot;
    });
    const carousel = nodes['mode-carousel'];
    carousel.dataset = {rankedUrl:'/player-selection',quickplayUrl:'/quickplay',sixPlayerUrl:'/six-player'};
    carousel.clientWidth=820;
    carousel.scrollLeft=0;
    carousel.querySelectorAll=()=>cards;
    carousel.getBoundingClientRect=()=>({left:0,width:820});
    carousel.scrollTo=({left})=>{carousel.scrollLeft=left;};
    carousel.focus=()=>{};

    cards.forEach((card,index)=>{
        card.getBoundingClientRect=()=>({left:210 + index*416 - carousel.scrollLeft,width:400});
    });

    const document = {
        getElementById(id) {return nodes[id];},
        querySelectorAll() {return dots;},
        addEventListener() {},
        createTextNode(text) {return {textContent:text};},
        createElement(tag) {return fakeElement(tag);}
    };

    let navigated='';
    const timers = new Map();
    let nextTimer = 1;
    const window = {
        matchMedia:()=>({matches:false}),
        location:{assign(url){navigated=url;}},
        setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},
        clearTimeout(id){timers.delete(id);},
        addEventListener() {}
    };
    const context = vm.createContext({document,window,console,Date});
    vm.runInContext(source,context);
    vm.runInContext('initModePicker()',context);
    return {
        nodes,cards,dots,carousel,
        flush() {for(const fn of timers.values())fn();timers.clear();},
        selectedUrl:()=>nodes['mode-start'].href,
        navigatedTo:()=>navigated
    };
}

test('next/previous controls highlight the corresponding card and update Weiter', () => {
    const f=fixture();
    assert.equal(f.selectedUrl(),'/quickplay');
    assert.equal(f.nodes['mode-previous'].disabled,true);
    f.nodes['mode-next'].fire('click');
    assert.equal(f.selectedUrl(),'/player-selection');
    assert.equal(f.cards[1].attributes['aria-selected'],'true');
    assert.equal(f.carousel.attributes['aria-activedescendant'],'mode-card-1');
    assert.equal(f.carousel.scrollLeft,416);
    f.nodes['mode-next'].fire('click');
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.nodes['mode-next'].disabled,true);
    f.nodes['mode-previous'].fire('click');
    assert.equal(f.selectedUrl(),'/player-selection');
});

test('touch-like native horizontal scroll picks the card nearest the center', () => {
    const f=fixture();
    f.carousel.scrollLeft=416;
    f.carousel.fire('scroll');
    f.flush();
    assert.equal(f.selectedUrl(),'/player-selection');
    assert.equal(f.dots[1].attributes['aria-current'],'true');

    f.carousel.scrollLeft=832;
    f.carousel.fire('scroll');
    f.flush();
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.cards[2].classList.contains('is-active'),true);
});

test('tap on card starts its game mode immediately, no Weiter click required', () => {
    for (const [index, target] of [[0, '/quickplay'], [1, '/player-selection'], [2, '/six-player']]) {
        const f=fixture();
        f.cards[index].fire('click', {detail: 1});
        assert.equal(f.selectedUrl(),target);
        assert.equal(f.cards[index].attributes['aria-selected'],'true');
        assert.equal(f.navigatedTo(),target);
    }

    const f=fixture();
    f.dots[2].fire('click');
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.navigatedTo(),'');
});

test('swiping horizontally does not accidentally open a match from synthetic click', () => {
    const f=fixture();
    const track = f.carousel;
    track.fire('pointerdown', {pointerId: 1, clientX: 160, clientY: 100});
    track.fire('pointermove', {pointerId: 1, clientX: 95, clientY: 102});
    track.fire('pointerup', {pointerId: 1, clientX: 90, clientY: 102});
    f.cards[1].fire('click', {detail: 1});
    assert.equal(f.navigatedTo(),'');

    // Keyboard-generated clicks may still activate their card.
    f.cards[1].fire('click', {detail: 0});
    assert.equal(f.navigatedTo(),'/player-selection');
});

test('short finger tap still opens a card directly', () => {
    const f=fixture();
    const track = f.carousel;
    track.fire('pointerdown', {pointerId: 1, clientX: 160, clientY: 100});
    track.fire('pointerup', {pointerId: 1, clientX: 159, clientY: 101});
    f.cards[2].fire('click', {detail: 1});
    assert.equal(f.navigatedTo(),'/six-player');
});

test('horizontal keyboard navigation, Enter and mouse wheel support desktop users', () => {
    const f=fixture();
    const key=code=>f.carousel.fire('keydown',{key:code});
    assert.equal(key('ArrowRight').defaultPrevented,true);
    assert.equal(f.selectedUrl(),'/player-selection');
    key('End');
    assert.equal(f.selectedUrl(),'/six-player');
    key('Home');
    assert.equal(f.selectedUrl(),'/quickplay');

    // Native horizontal trackpad gestures must remain available.
    const native=f.carousel.fire('wheel',{deltaX:120,deltaY:0});
    assert.equal(native.defaultPrevented,false);

    const mouse=f.carousel.fire('wheel',{deltaX:0,deltaY:120});
    assert.equal(mouse.defaultPrevented,true);
    assert.equal(f.selectedUrl(),'/player-selection');

    key('Enter');
    assert.equal(f.navigatedTo(),'/player-selection');
});
