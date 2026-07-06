// Questions for Paper 13
let quizData = PN13;

// Start from the first question
let currentQuestion = 0;

function loadQuestion() {
    const question = quizData[currentQuestion];

    console.log(question.q);      // Question
    console.log(question.o);      // Options
    console.log(question.a);      // Correct answer
}

loadQuestion();
