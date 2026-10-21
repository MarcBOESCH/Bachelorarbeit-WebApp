const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('templates/home.html','utf8');
const css = fs.readFileSync('static/css/style.css','utf8');
const src = fs.readFileSync('static/js/pages/home.js','utf8');

test('only Quickplay and ranked modes appear in the home carousel', () => {
    assert.match(html,/id="mode-card-0"/);
    assert.match(html,/id="mode-card-1"/);
    assert.doesNotMatch(html,/id="mode-card-2"|mode-card--six|data-mode-target="2"/);
    assert.ok(html.indexOf("mode-card--quickplay")<html.indexOf("mode-card--ranked"));
    assert.match(src, /window\.location\.assign\(modes\[index\]\.url\)/);
    assert.match(css,/scroll-snap-type:\s*x mandatory/);
    assert.match(css,/touch-action:\s*pan-x/);
    assert.match(css,/\.mode-carousel-card\s*\{[^}]*height:\s*390px/);
    assert.doesNotMatch(css,/box-shadow:[^;]*rgba\(15, 32, 28/);
    assert.doesNotMatch(css,/box-shadow:[^;]*rgba\(15, 61, 44/);
    assert.match(html,/href="{{ url_for\('free_play.quickplay_page'\) }}"/);
});

function node(id) {
    const classes=new Set();
    return {
        id, dataset:{}, attributes:{},children:[],listeners:{}, href:'',disabled:false,
        classList:{
            toggle(x,enabled){if(enabled)classes.add(x);else classes.delete(x);},
            contains(x){return classes.has(x);}
        },
        setAttribute(k,v){this.attributes[k]=v;},
        removeAttribute(k){delete this.attributes[k];},
        replaceChildren(...x){this.children=x;},
        append(...x){this.children.push(...x);},
        addEventListener(type,fn){this.listeners[type]=fn;},
        fire(type,params={}) {
            const event={detail:0,preventDefault(){this.defaultPrevented=true;},...params};
            this.listeners[type](event);return event;
        }
    };
}

function fixture(){
    const ids=['mode-carousel','mode-previous','mode-next','mode-details-description',
        'mode-start','mode-card-0','mode-card-1'];
    const items=Object.fromEntries(ids.map(id=>[id,node(id)]));
    const cards=[items['mode-card-0'],items['mode-card-1']];
    const dots=[node('dot0'),node('dot1')];
    const carousel=items['mode-carousel'];
    carousel.dataset={quickplayUrl:'/quickplay',rankedUrl:'/player-selection'};
    carousel.scrollLeft=0;
    carousel.querySelectorAll=()=>cards;
    carousel.getBoundingClientRect=()=>({left:0,width:820});
    carousel.scrollTo=({left})=>{carousel.scrollLeft=left;};
    carousel.focus=()=>{};
    cards.forEach((card,index)=>{
        card.getBoundingClientRect=()=>({left:210+index*416-carousel.scrollLeft,width:400});
    });
    let navigated='';
    const timers=new Map();let nextTimer=0;
    const document={
        getElementById(id){return items[id];},
        querySelectorAll(){return dots;},
        createElement(tag){return node(tag);},
        createTextNode(text){return{textContent:text};},
        addEventListener(){}
    };
    const window={
        matchMedia(){return{matches:false};},
        location:{assign(url){navigated=url;}},
        setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},
        clearTimeout(id){timers.delete(id);},
        addEventListener(){}
    };
    const context=vm.createContext({document,window,Date,console});
    vm.runInContext(src,context);
    vm.runInContext('initModePicker()',context);
    return {items,cards,carousel,dots,navigatedTo:()=>navigated,
        flush(){for(const fn of timers.values())fn();timers.clear();}
    };
}

test('Quickplay is selected first and card tap opens Quickplay immediately',()=>{
    const f=fixture();
    assert.equal(f.items['mode-start'].href,'/quickplay');
    assert.equal(f.items['mode-previous'].disabled,true);
    f.cards[0].fire('click',{detail:1});
    assert.equal(f.navigatedTo(),'/quickplay');
});

test('ranked card opens player selection, navigation arrows only move selection',()=>{
    const f=fixture();
    f.items['mode-next'].fire('click');
    assert.equal(f.items['mode-start'].href,'/player-selection');
    assert.equal(f.navigatedTo(),'');
    assert.equal(f.items['mode-next'].disabled,true);
    f.cards[1].fire('click',{detail:1});
    assert.equal(f.navigatedTo(),'/player-selection');
});

test('horizontal swipe suppresses synthetic card clicks',()=>{
    const f=fixture(),track=f.carousel;
    track.fire('pointerdown',{pointerId:1,clientX:160,clientY:100});
    track.fire('pointermove',{pointerId:1,clientX:90,clientY:100});
    track.fire('pointerup',{pointerId:1,clientX:90,clientY:100});
    f.cards[1].fire('click',{detail:1});
    assert.equal(f.navigatedTo(),'');
    track.scrollLeft=416;
    track.fire('scroll');
    f.flush();
    assert.equal(f.items['mode-start'].href,'/player-selection');
});

test('short tap and keyboard activate the intended selection',()=>{
    const f=fixture(),track=f.carousel;
    track.fire('pointerdown',{pointerId:1,clientX:160,clientY:100});
    track.fire('pointerup',{pointerId:1,clientX:160,clientY:100});
    f.cards[1].fire('click',{detail:1});
    assert.equal(f.navigatedTo(),'/player-selection');

    const keys=fixture();
    keys.carousel.fire('keydown',{key:'ArrowRight'});
    keys.carousel.fire('keydown',{key:'Enter'});
    assert.equal(keys.navigatedTo(),'/player-selection');
});
