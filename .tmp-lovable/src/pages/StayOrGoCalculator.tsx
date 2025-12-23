import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface Question {
  id: number;
  text: string;
  options: { label: string; score: number }[];
}

const questions: Question[] = [
  {
    id: 1,
    text: "How would you rate your opportunities for growth and advancement?",
    options: [
      { label: "Excellent — clear path forward", score: 4 },
      { label: "Good — some opportunities available", score: 3 },
      { label: "Limited — not much room to grow", score: 2 },
      { label: "None — I've hit a ceiling", score: 1 },
    ]
  },
  {
    id: 2,
    text: "How would you describe your relationship with your direct manager?",
    options: [
      { label: "Strong — they advocate for me", score: 4 },
      { label: "Okay — functional but not great", score: 3 },
      { label: "Strained — frequent conflicts", score: 2 },
      { label: "Broken — actively harmful", score: 1 },
    ]
  },
  {
    id: 3,
    text: "How do you feel on Sunday evenings about the week ahead?",
    options: [
      { label: "Energized — looking forward to it", score: 4 },
      { label: "Neutral — it's fine", score: 3 },
      { label: "Anxious — dreading Monday", score: 2 },
      { label: "Depressed — can't face another week", score: 1 },
    ]
  },
  {
    id: 4,
    text: "How aligned is your work with your long-term career goals?",
    options: [
      { label: "Perfectly aligned — building toward my future", score: 4 },
      { label: "Mostly aligned — on the right track", score: 3 },
      { label: "Somewhat misaligned — drifting", score: 2 },
      { label: "Completely misaligned — wrong direction", score: 1 },
    ]
  },
  {
    id: 5,
    text: "How would you rate your compensation relative to market?",
    options: [
      { label: "Above market — well compensated", score: 4 },
      { label: "At market — fair", score: 3 },
      { label: "Below market — underpaid", score: 2 },
      { label: "Significantly below — exploited", score: 1 },
    ]
  },
  {
    id: 6,
    text: "How much are you learning and developing new skills?",
    options: [
      { label: "A lot — constantly growing", score: 4 },
      { label: "Some — occasional learning", score: 3 },
      { label: "Little — skills stagnating", score: 2 },
      { label: "None — actively declining", score: 1 },
    ]
  },
  {
    id: 7,
    text: "How do you feel about the company's future?",
    options: [
      { label: "Optimistic — bright future ahead", score: 4 },
      { label: "Cautious — some concerns", score: 3 },
      { label: "Worried — significant risks", score: 2 },
      { label: "Pessimistic — headed for trouble", score: 1 },
    ]
  },
];

const StayOrGoCalculator = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const heroReveal = useScrollReveal();

  const handleAnswer = (score: number) => {
    setAnswers({ ...answers, [currentQuestion]: score });
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const goBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const resetQuiz = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setShowResults(false);
  };

  const totalScore = Object.values(answers).reduce((sum, score) => sum + score, 0);
  const maxScore = questions.length * 4;
  const percentage = Math.round((totalScore / maxScore) * 100);

  const getRecommendation = () => {
    if (percentage >= 75) {
      return {
        title: "Stay — with intention",
        description: "Your situation looks solid. Focus on growth and making the most of where you are.",
        color: "text-primary"
      };
    } else if (percentage >= 50) {
      return {
        title: "Address the issues first",
        description: "There are fixable problems. Have the hard conversations before you start looking.",
        color: "text-accent"
      };
    } else if (percentage >= 25) {
      return {
        title: "Start exploring",
        description: "The signs point toward leaving. Begin your search while you still have leverage.",
        color: "text-accent"
      };
    } else {
      return {
        title: "Time to go",
        description: "Staying is costing you more than the uncertainty of leaving. Prioritize your exit.",
        color: "text-destructive"
      };
    }
  };

  const recommendation = getRecommendation();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="sp-container py-6 flex items-center justify-between animate-fade-in">
        <Link to="/" className="font-display text-xl tracking-tight hover:text-primary transition-colors duration-300">
          Serious People
        </Link>
        
        <div className="hidden md:flex items-center gap-8">
          <Link to="/guides" className="sp-link text-sm text-muted-foreground hover:text-foreground transition-colors">
            Guides
          </Link>
          <Link to="/tools/stay-or-go-calculator" className="text-sm text-foreground font-medium">
            Calculator
          </Link>
          <Link to="/interview" className="text-sm font-medium hover:text-primary transition-colors">
            Start Session
          </Link>
        </div>
        
        <button 
          className="md:hidden p-2 -mr-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background animate-fade-in">
          <div className="sp-container py-4 flex flex-col gap-4">
            <Link to="/guides" className="text-sm text-muted-foreground py-2">Guides</Link>
            <Link to="/tools/stay-or-go-calculator" className="text-sm font-medium py-2">Calculator</Link>
            <Link to="/interview" className="text-sm font-medium py-2">Start Session</Link>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="sp-container py-12 md:py-16">
        <div 
          ref={heroReveal.ref}
          className={`max-w-xl mx-auto reveal ${heroReveal.isRevealed ? "revealed" : ""}`}
        >
          {!showResults ? (
            <>
              {/* Header */}
              <div className="text-center mb-12">
                <h1 className="font-display text-3xl md:text-4xl mb-4">
                  Should You Stay or Go?
                </h1>
                <p className="text-muted-foreground">
                  Answer {questions.length} quick questions to get a personalized recommendation. Takes about 2 minutes.
                </p>
              </div>

              {/* Progress */}
              <div className="mb-8">
                <div className="flex justify-between text-sm text-muted-foreground mb-2">
                  <span>Question {currentQuestion + 1} of {questions.length}</span>
                </div>
                <div className="h-1 bg-border rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question */}
              <div className="mb-8 animate-fade-in" key={currentQuestion}>
                <p className="sp-eyebrow text-muted-foreground mb-3">
                  Question {currentQuestion + 1} of {questions.length}
                </p>
                <h2 className="font-display text-xl md:text-2xl mb-8">
                  {questions[currentQuestion].text}
                </h2>

                {/* Options */}
                <div className="space-y-3">
                  {questions[currentQuestion].options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswer(option.score)}
                      className={`w-full p-4 text-left border transition-all duration-200 hover:border-primary/50 hover:bg-muted/30 ${
                        answers[currentQuestion] === option.score
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={goBack}
                  disabled={currentQuestion === 0}
                  className="text-muted-foreground"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => handleAnswer(answers[currentQuestion] || 0)}
                  disabled={!answers[currentQuestion]}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          ) : (
            /* Results */
            <div className="animate-fade-in">
              <div className="text-center mb-12">
                <h1 className="font-display text-3xl md:text-4xl mb-4">
                  Your Results
                </h1>
              </div>

              {/* Score */}
              <div className="text-center mb-12 p-8 border border-border">
                <div className="mb-6">
                  <span className="font-display text-6xl">{percentage}</span>
                  <span className="text-2xl text-muted-foreground">/100</span>
                </div>
                <h2 className={`font-display text-2xl mb-3 ${recommendation.color}`}>
                  {recommendation.title}
                </h2>
                <p className="text-muted-foreground">
                  {recommendation.description}
                </p>
              </div>

              {/* Score Breakdown */}
              <div className="mb-12">
                <h3 className="font-display text-lg mb-4">Your Score Breakdown</h3>
                <div className="space-y-3">
                  {questions.map((question, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground truncate mr-4">Q{index + 1}: {question.text.slice(0, 40)}...</span>
                      <span className="font-medium">{answers[index]}/4</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="bg-foreground text-background p-8 text-center mb-8">
                <h3 className="font-display text-xl mb-3">Want Personalized Guidance?</h3>
                <p className="text-background/70 mb-6 text-sm">
                  Get tailored advice for your specific situation with our AI-powered coaching interview.
                </p>
                <Link to="/interview">
                  <Button className="bg-background text-foreground hover:bg-background/90">
                    Start Your Free Interview
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>

              <button
                onClick={resetQuiz}
                className="w-full text-center text-muted-foreground hover:text-foreground transition-colors"
              >
                Take the Quiz Again
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="sp-container py-12 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Serious People. Career coaching for serious decisions.</p>
          <div className="flex items-center gap-8">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/guides" className="hover:text-foreground transition-colors">Guides</Link>
            <Link to="/interview" className="hover:text-foreground transition-colors">Start Session</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StayOrGoCalculator;
