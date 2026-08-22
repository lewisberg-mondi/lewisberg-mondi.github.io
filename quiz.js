/**
 * Quiz / Flashcard mode based on learned knowledge
 */
const Quiz = (() => {
  let currentQuestion = null;

  function generateQuestion() {
    const facts = Knowledge.getAll();
    if (facts.length === 0) return null;
    const fact = facts[Math.floor(Math.random() * facts.length)];
    currentQuestion = {
      fact,
      question: `What do you know about: **${fact.subject}**?`,
      answer: fact.content
    };
    return currentQuestion;
  }

  function checkAnswer(userAnswer) {
    if (!currentQuestion) return { correct: false, message: "No active question." };
    const correct = currentQuestion.answer.toLowerCase();
    const given = userAnswer.toLowerCase();
    const overlap = correct.split(/\W+/).filter(w => w.length > 3 && given.includes(w)).length;
    const score = overlap / Math.max(1, correct.split(/\W+/).filter(w => w.length > 3).length);
    const isCorrect = score > 0.4 || given.includes(correct.slice(0, 20));
    Neurons.activate("quiz:" + (isCorrect ? "correct" : "wrong"), 2);
    let bonus = "";
    if (isCorrect && typeof LMTWallet !== "undefined") {
      try {
        if (LMTWallet.rewardQuestion) {
          const bal = LMTWallet.rewardQuestion();
          bonus = " · +reward 💎 LMT";
        } else if (LMTWallet.info) {
          bonus = " · good job";
        }
      } catch (_) {}
    }
    if (typeof StudyHub !== "undefined" && StudyHub.touchStreak) {
      try { StudyHub.touchStreak("quiz"); } catch (_) {}
    }
    const result = {
      correct: isCorrect,
      message: isCorrect
        ? `Correct! ${currentQuestion.answer}` + bonus
        : `Not quite. The answer is: ${currentQuestion.answer}`,
      score
    };
    currentQuestion = null;
    return result;
  }

  function getCurrent() { return currentQuestion; }

  return { generateQuestion, checkAnswer, getCurrent };
})();
