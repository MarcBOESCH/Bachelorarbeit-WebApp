let scoreA = 0;
let scoreB = 0;

const scoreAElement = document.getElementById("score-a");
const scoreBElement = document.getElementById("score-b");
const summaryAElement = document.getElementById("summary-a");
const summaryBElement = document.getElementById("summary-b");
const pointDiffElement = document.getElementById("point-diff");
const leaderElement = document.getElementById("leader");
const resetButton = document.getElementById("reset-btn");

const scoreButtons = document.querySelectorAll(".score-btn");
const subtractButtons = document.querySelectorAll(".subtract-btn");

function updateUI() {
    scoreAElement.textContent = scoreA;
    scoreBElement.textContent = scoreB;

    summaryAElement.textContent = scoreA;
    summaryBElement.textContent = scoreB;

    const difference = Math.abs(scoreA - scoreB);
    pointDiffElement.textContent = difference;

    if (scoreA > scoreB) {
        leaderElement.textContent = "Team A";
    } else if (scoreB > scoreA) {
        leaderElement.textContent = "Team B";
    } else {
        leaderElement.textContent = "-";
    }
}

scoreButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const team = button.dataset.team;
        const points = Number(button.dataset.points);

        if (team === "A") {
            scoreA += points;
        } else if (team === "B") {
            scoreB += points;
        }

        updateUI();
    });
});

subtractButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const team = button.dataset.team;

        if (team === "A" && scoreA > 0) {
            scoreA -= 1;
        } else if (team === "B" && scoreB > 0) {
            scoreB -= 1;
        }

        updateUI();
    });
});

resetButton.addEventListener("click", () => {
    scoreA = 0;
    scoreB = 0;
    updateUI();
});

updateUI();