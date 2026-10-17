const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createSnakeHarness() {
    const elements = new Map();
    for (const team of ['a', 'b']) {
        for (const points of [100, 50, 20]) {
            elements.set(`tally-${team}-${points}`, {
                children: [],
                set innerHTML(value) {
                    if (value === '') this.children = [];
                },
                appendChild(child) { this.children.push(child); }
            });
        }
        elements.set(`rest-${team}`, { textContent: '' });
    }

    const document = {
        addEventListener() {},
        getElementById(id) { return elements.get(id) ?? null; },
        createElement(tag) { return { tag }; }
    };
    const ctx = vm.createContext({ document });
    vm.runInContext(fs.readFileSync('static/js/pages/match.js', 'utf8'), ctx);

    function tallyCount(team, size) {
        return elements.get(`tally-${team}-${size}`).children.length;
    }
    function remainder(team) {
        return Number(elements.get(`rest-${team}`).textContent || 0);
    }
    function reconstructedScore(team) {
        return tallyCount(team, 100) * 100
            + tallyCount(team, 50) * 50
            + tallyCount(team, 20) * 20
            + remainder(team);
    }
    return { ctx, tallyCount, remainder, reconstructedScore, elements };
}

test('Schlange carries accumulated remainders into additional 20-point marks', () => {
    const snake = createSnakeHarness();
    // Match the reported screenshot totals: 381 and 270.
    snake.ctx.renderSnakeScores('a', 381, [0, 101, 219, 361]);
    snake.ctx.renderSnakeScores('b', 270, [0, 115, 230]);

    assert.equal(snake.reconstructedScore('a'), 381);
    assert.equal(snake.reconstructedScore('b'), 270);
    assert.equal(snake.remainder('a'), 1);
    assert.equal(snake.remainder('b'), 10);
    assert.equal(snake.tallyCount('a', 20), 4);
    assert.equal(snake.tallyCount('b', 20), 3);
});

test('Schlange remainder stays below 20 across actions and undo', () => {
    const snake = createSnakeHarness();
    for (const [score, history, remaining] of [
        [19, [0], 19],
        [20, [0], 0],
        [21, [0], 1],
        [30, [0], 10],
        [41, [0], 1],
        [219, [0, 101], 19],
        [0, [], 0]
    ]) {
        snake.ctx.renderSnakeScores('a', score, history);
        assert.equal(snake.reconstructedScore('a'), score);
        assert.equal(snake.remainder('a'), remaining);
        assert.ok(snake.remainder('a') >= 0 && snake.remainder('a') < 20);
    }

    // Without an undo history, the existing direct total decomposition works.
    snake.ctx.renderSnakeScores('b', 270, []);
    assert.equal(snake.reconstructedScore('b'), 270);
    assert.equal(snake.remainder('b'), 0);
});
