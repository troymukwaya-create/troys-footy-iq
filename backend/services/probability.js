// backend/services/probability.js
function poissonCDF(lambda, maxGoals = 10) {
  const probs = [];
  let factorial = 1;
  for (let k = 0; k <= maxGoals; k++) {
    if (k > 0) factorial *= k;
    probs.push((Math.pow(lambda, k) * Math.exp(-lambda)) / factorial);
  }
  return probs;
}

function calculateAllMarkets(homeAvgGoals, awayAvgGoals) {
  const lambdaH = homeAvgGoals || 1.4;
  const lambdaA = awayAvgGoals || 1.2;

  const homeProbs = poissonCDF(lambdaH);
  const awayProbs = poissonCDF(lambdaA);

  let homeWin = 0, draw = 0, awayWin = 0;
  let over15 = 0, over25 = 0, over35 = 0;
  let bttsYes = 0;

  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = (homeProbs[h] || 0) * (awayProbs[a] || 0);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      const total = h + a;
      if (total > 1.5) over15 += p;
      if (total > 2.5) over25 += p;
      if (total > 3.5) over35 += p;
      if (h > 0 && a > 0) bttsYes += p;
    }
  }

  return {
    home_prob:   Math.round(homeWin * 100),
    draw_prob:   Math.round(draw * 100),
    away_prob:   Math.round(awayWin * 100),
    over15_prob: Math.round(over15 * 100),
    over25_prob: Math.round(over25 * 100),
    over35_prob: Math.round(over35 * 100),
    under25_prob: Math.round((1 - over25) * 100),
    btts_prob:   Math.round(bttsYes * 100),
  };
}

export { calculateAllMarkets, poissonCDF };
