const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('templates/home.html', 'utf8');
const css = fs.readFileSync('static/css/style.css', 'utf8');
const source = fs.readFileSync('static/js/pages/home.js', 'utf8');

test('horizontal carousel contains three long, individually selectable cards', () => {
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
    assert.match(css, /\.mode-carousel-card\s*\{[^}]*min-height:\s*158px/);
    assert.match(css, /\.mode-carousel-card\.is-active/);
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
    assert.equal(f.selectedUrl(),'/player-selection');
    assert.equal(f.nodes['mode-previous'].disabled,true);
    f.nodes['mode-next'].fire('click');
    assert.equal(f.selectedUrl(),'/quickplay');
    assert.equal(f.cards[1].attributes['aria-selected'],'true');
    assert.equal(f.carousel.attributes['aria-activedescendant'],'mode-card-1');
    assert.equal(f.carousel.scrollLeft,416);
    f.nodes['mode-next'].fire('click');
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.nodes['mode-next'].disabled,true);
    f.nodes['mode-previous'].fire('click');
    assert.equal(f.selectedUrl(),'/quickplay');
});

test('touch-like native horizontal scroll picks the card nearest the center', () => {
    const f=fixture();
    f.carousel.scrollLeft=416;
    f.carousel.fire('scroll');
    f.flush();
    assert.equal(f.selectedUrl(),'/quickplay');
    assert.equal(f.dots[1].attributes['aria-current'],'true');

    f.carousel.scrollLeft=832;
    f.carousel.fire('scroll');
    f.flush();
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.cards[2].classList.contains('is-active'),true);
});

test('click on a long card or pagination indicator centers it', () => {
    const f=fixture();
    f.cards[2].fire('click');
    assert.equal(f.selectedUrl(),'/six-player');
    assert.equal(f.carousel.scrollLeft,832);
    f.dots[0].fire('click');
    assert.equal(f.selectedUrl(),'/player-selection');
    assert.equal(f.carousel.scrollLeft,0);
});

test('horizontal keyboard navigation, Enter and mouse wheel support desktop users', () => {
    const f=fixture();
    const key=code=>f.carousel.fire('keydown',{key:code});
    assert.equal(key('ArrowRight').defaultPrevented,true);
    assert.equal(f.selectedUrl(),'/quickplay');
    key('End');
    assert.equal(f.selectedUrl(),'/six-player');
    key('Home');
    assert.equal(f.selectedUrl(),'/player-selection');

    // Native horizontal trackpad gestures must remain available.
    const native=f.carousel.fire('wheel',{deltaX:120,deltaY:0});
    assert.equal(native.defaultPrevented,false);

    const mouse=f.carousel.fire('wheel',{deltaX:0,deltaY:120});
    assert.equal(mouse.defaultPrevented,true);
    assert.equal(f.selectedUrl(),'/quickplay');

    key('Enter');
    assert.equal(f.navigatedTo(),'/quickplay');
});
