// gamification.js - Quiz and Leaderboard System for Lockdown

class LockdownGameSystem {
  constructor() {
    this.userId = null;
    this.userName = '';
    this.userPoints = 0;
    this.lastQuizTime = 0;
    this.quizCooldown = 24 * 60 * 60 * 1000; // 24 hours
    this.currentQuiz = null;
    this.quizActive = false;
    this.leaderboardData = [];
    
    // Quiz questions database
    this.questions = [
      {
        question: "What makes a password strong?",
        options: ["Length and complexity", "Using your name", "Using common words", "Making it easy to remember"],
        correct: 0,
        explanation: "Strong passwords combine length, complexity, and unpredictability to resist attacks."
      },
      {
        question: "How often should you change your passwords?",
        options: ["Every week", "Only when compromised", "Every month", "Never"],
        correct: 1,
        explanation: "Modern security experts recommend changing passwords only when there's evidence of compromise."
      },
      {
        question: "What is two-factor authentication (2FA)?",
        options: ["Using two passwords", "An extra security layer", "A type of encryption", "A password manager"],
        correct: 1,
        explanation: "2FA adds an extra layer of security by requiring something you know AND something you have."
      },
      {
        question: "Which is the safest way to store passwords?",
        options: ["Write them down", "Use a password manager", "Remember them all", "Save in browser"],
        correct: 1,
        explanation: "Password managers encrypt and securely store all your passwords with military-grade security."
      },
      {
        question: "What is a phishing attack?",
        options: ["A type of virus", "Fake emails to steal info", "Password cracking", "Website hacking"],
        correct: 1,
        explanation: "Phishing uses fake emails or websites to trick people into revealing sensitive information."
      },
      {
        question: "What's the minimum recommended password length?",
        options: ["6 characters", "8 characters", "12 characters", "16 characters"],
        correct: 2,
        explanation: "Security experts recommend at least 12 characters for strong password protection."
      },
      {
        question: "What should you do if you suspect your password is compromised?",
        options: ["Wait and see", "Change it immediately", "Use it less often", "Add numbers to it"],
        correct: 1,
        explanation: "If you suspect compromise, change your password immediately and check for unauthorized access."
      },
      {
        question: "Which of these is NOT a good password practice?",
        options: ["Using unique passwords", "Sharing passwords with friends", "Using a password manager", "Enabling 2FA"],
        correct: 1,
        explanation: "Never share passwords with anyone, even trusted friends or family members."
      },
      {
        question: "What is social engineering?",
        options: ["A coding technique", "Manipulating people for info", "A type of software", "Password encryption"],
        correct: 1,
        explanation: "Social engineering manipulates people psychologically to divulge confidential information."
      },
      {
        question: "How many passwords should you reuse across different accounts?",
        options: ["As many as needed", "Up to 3 sites", "Only for unimportant sites", "Zero - never reuse"],
        correct: 3,
        explanation: "Each account should have a unique password to prevent credential stuffing attacks."
      },
      {
        question: "What is credential stuffing?",
        options: ["Password encryption", "Using leaked passwords on other sites", "Creating strong passwords", "Two-factor authentication"],
        correct: 1,
        explanation: "Credential stuffing uses leaked username/password combinations to access other accounts."
      },
      {
        question: "Which is the most secure authentication method?",
        options: ["Password only", "SMS codes", "Authenticator apps", "Email verification"],
        correct: 2,
        explanation: "Authenticator apps generate time-based codes and are more secure than SMS or email."
      }
    ];
    
    this.init();
  }

  async init() {
    console.log('Lockdown Game System initializing...');
    
    // Load user data
    await this.loadUserData();
    
    // Set up periodic quiz check
    this.setupQuizTimer();
    
    // Check if quiz is due
    this.checkQuizAvailability();
    
    console.log('Game System ready - User:', this.userName, 'Points:', this.userPoints);
  }

  async loadUserData() {
    try {
      const data = await chrome.storage.local.get([
        'gameUserId', 'gameUserName', 'gameUserPoints', 'gameLastQuizTime'
      ]);
      
      this.userId = data.gameUserId || this.generateUserId();
      this.userName = data.gameUserName || await this.promptForUsername();
      this.userPoints = data.gameUserPoints || 0;
      this.lastQuizTime = data.gameLastQuizTime || 0;
      
      // Save if this is first time
      if (!data.gameUserId) {
        await this.saveUserData();
      }
      
    } catch (error) {
      console.error('Failed to load game data:', error);
      this.userId = this.generateUserId();
      this.userName = 'Anonymous Player';
      this.userPoints = 0;
      this.lastQuizTime = 0;
    }
  }

  async saveUserData() {
    try {
      await chrome.storage.local.set({
        gameUserId: this.userId,
        gameUserName: this.userName,
        gameUserPoints: this.userPoints,
        gameLastQuizTime: this.lastQuizTime
      });
    } catch (error) {
      console.error('Failed to save game data:', error);
    }
  }

  generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async promptForUsername() {
    return new Promise((resolve) => {
      const modal = this.createModal('Welcome to Lockdown Quiz!', `
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">🏆</div>
          <p style="color: #999; margin-bottom: 16px;">
            Test your cybersecurity knowledge and compete with other Lockdown users!
          </p>
        </div>
        <div style="margin-bottom: 16px;">
          <input type="text" id="username-input" placeholder="Enter your display name" 
                 maxlength="20" style="
            width: 100%;
            padding: 12px;
            border: 1px solid #444;
            border-radius: 8px;
            background: #2a2a2a;
            color: white;
            font-size: 14px;
          ">
        </div>
        <button id="username-submit" style="
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">Join the Game!</button>
      `);

      const input = modal.querySelector('#username-input');
      const submit = modal.querySelector('#username-submit');

      const submitName = () => {
        const name = input.value.trim();
        if (name && name.length >= 2) {
          document.body.removeChild(modal);
          resolve(name);
        } else {
          input.style.borderColor = '#EF4444';
          input.placeholder = 'Please enter at least 2 characters';
        }
      };

      submit.addEventListener('click', submitName);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitName();
      });

      document.body.appendChild(modal);
      input.focus();
    });
  }

  setupQuizTimer() {
    // Check every hour if quiz is available
    setInterval(() => {
      this.checkQuizAvailability();
    }, 60 * 60 * 1000);
    
    // Also check every time extension starts
    setTimeout(() => this.checkQuizAvailability(), 5000);
  }

  checkQuizAvailability() {
    const now = Date.now();
    const timeSinceLastQuiz = now - this.lastQuizTime;
    
    console.log(`Quiz check: ${timeSinceLastQuiz}ms since last quiz (need ${this.quizCooldown}ms)`);
    
    if (timeSinceLastQuiz >= this.quizCooldown) {
      this.showQuizNotification();
    }
  }

  showQuizNotification() {
    if (this.quizActive) return; // Don't show multiple notifications
    
    const notification = this.createFloatingNotification(
      '🎯 Daily Quiz Available!',
      'Test your cybersecurity knowledge and earn 9 points!',
      [
        { text: 'Start Quiz', action: () => this.startQuiz(), primary: true },
        { text: 'Later', action: () => notification.remove() }
      ]
    );
  }

  async startQuiz() {
    if (this.quizActive) return;
    
    this.quizActive = true;
    this.currentQuiz = {
      questions: this.getRandomQuestions(3),
      currentQuestion: 0,
      correctAnswers: 0,
      startTime: Date.now()
    };
    
    this.showQuizModal();
  }

  getRandomQuestions(count) {
    const shuffled = [...this.questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  showQuizModal() {
    const quiz = this.currentQuiz;
    const question = quiz.questions[quiz.currentQuestion];
    const questionNum = quiz.currentQuestion + 1;
    
    const modal = this.createModal(`Quiz Question ${questionNum}/3`, `
      <div style="margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%); 
                    border-radius: 12px; padding: 20px; margin-bottom: 16px;">
          <div style="color: #10B981; font-size: 14px; font-weight: 600; margin-bottom: 8px;">
            Question ${questionNum} of 3
          </div>
          <div style="color: white; font-size: 16px; font-weight: 600; line-height: 1.4;">
            ${question.question}
          </div>
        </div>
        
        <div id="quiz-options" style="margin-bottom: 20px;">
          ${question.options.map((option, index) => `
            <button class="quiz-option" data-index="${index}" style="
              width: 100%;
              padding: 12px 16px;
              margin-bottom: 8px;
              background: #2a2a2a;
              border: 2px solid #404040;
              border-radius: 8px;
              color: white;
              text-align: left;
              cursor: pointer;
              transition: all 0.2s;
              font-size: 14px;
            " onmouseover="this.style.borderColor='#10B981'; this.style.background='#1f2f25'"
               onmouseout="this.style.borderColor='#404040'; this.style.background='#2a2a2a'">
              ${String.fromCharCode(65 + index)}. ${option}
            </button>
          `).join('')}
        </div>
        
        <div style="display: flex; justify-content: between; align-items: center;">
          <div style="color: #666; font-size: 12px;">
            Correct answers: ${quiz.correctAnswers}/${questionNum - 1}
          </div>
          <div style="color: #10B981; font-size: 12px; font-weight: 600;">
            🏆 Earn 9 points for 3/3 correct!
          </div>
        </div>
      </div>
    `, false); // Don't auto-close on outside click

    // Add option selection logic
    const options = modal.querySelectorAll('.quiz-option');
    options.forEach((option, index) => {
      option.addEventListener('click', () => {
        this.selectQuizAnswer(index, modal);
      });
    });

    document.body.appendChild(modal);
  }

  async selectQuizAnswer(selectedIndex, modal) {
    const quiz = this.currentQuiz;
    const question = quiz.questions[quiz.currentQuestion];
    const isCorrect = selectedIndex === question.correct;
    
    if (isCorrect) {
      quiz.correctAnswers++;
    }
    
    // Show feedback
    this.showAnswerFeedback(modal, isCorrect, question.explanation);
    
    setTimeout(async () => {
      document.body.removeChild(modal);
      
      quiz.currentQuestion++;
      
      if (quiz.currentQuestion < quiz.questions.length) {
        // Next question
        this.showQuizModal();
      } else {
        // Quiz complete
        await this.completeQuiz();
      }
    }, 3000);
  }

  showAnswerFeedback(modal, isCorrect, explanation) {
    const feedbackHtml = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 64px; margin-bottom: 16px;">
          ${isCorrect ? '✅' : '❌'}
        </div>
        <div style="color: ${isCorrect ? '#10B981' : '#EF4444'}; 
                    font-size: 18px; font-weight: 600; margin-bottom: 12px;">
          ${isCorrect ? 'Correct!' : 'Incorrect'}
        </div>
        <div style="color: #999; font-size: 14px; line-height: 1.5;">
          ${explanation}
        </div>
      </div>
    `;
    
    modal.querySelector('.modal-content').innerHTML = feedbackHtml;
  }

  async completeQuiz() {
    const quiz = this.currentQuiz;
    const score = quiz.correctAnswers;
    const perfect = score === 3;
    const pointsEarned = perfect ? 9 : 0;
    
    // Update user data
    if (pointsEarned > 0) {
      this.userPoints += pointsEarned;
    }
    this.lastQuizTime = Date.now();
    await this.saveUserData();
    
    // Submit score to leaderboard
    await this.submitScore(pointsEarned);
    
    // Show results
    this.showQuizResults(score, pointsEarned);
    
    this.quizActive = false;
    this.currentQuiz = null;
  }

  showQuizResults(score, pointsEarned) {
    const modal = this.createModal('Quiz Complete!', `
      <div style="text-align: center;">
        <div style="font-size: 64px; margin-bottom: 16px;">
          ${score === 3 ? '🏆' : score === 2 ? '🥈' : '📚'}
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="color: white; font-size: 24px; font-weight: 700; margin-bottom: 8px;">
            ${score}/3 Correct
          </div>
          <div style="color: ${pointsEarned > 0 ? '#10B981' : '#999'}; font-size: 18px; font-weight: 600;">
            ${pointsEarned > 0 ? `+${pointsEarned} Points Earned!` : 'No points this time'}
          </div>
        </div>
        
        <div style="background: #1f2937; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
          <div style="color: #999; font-size: 12px; margin-bottom: 4px;">Your Total Points</div>
          <div style="color: #10B981; font-size: 32px; font-weight: 700;">${this.userPoints}</div>
        </div>
        
        <div style="display: flex; gap: 8px;">
          <button id="view-leaderboard" style="
            flex: 1;
            padding: 12px;
            background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          ">View Leaderboard</button>
          <button id="close-results" style="
            flex: 1;
            padding: 12px;
            background: #374151;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          ">Close</button>
        </div>
        
        <div style="color: #666; font-size: 11px; margin-top: 12px;">
          Next quiz available in 24 hours
        </div>
      </div>
    `);

    modal.querySelector('#view-leaderboard').addEventListener('click', () => {
      document.body.removeChild(modal);
      this.showLeaderboard();
    });

    modal.querySelector('#close-results').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    document.body.appendChild(modal);
  }

  async submitScore(pointsEarned) {
    // In a real implementation, this would submit to a backend API
    // For demo purposes, we'll simulate with local storage
    try {
      const playerData = {
        userId: this.userId,
        userName: this.userName,
        points: this.userPoints,
        lastActive: Date.now()
      };
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Score submitted:', playerData);
      return { success: true };
    } catch (error) {
      console.error('Failed to submit score:', error);
      return { success: false };
    }
  }

  async showLeaderboard() {
    // Load leaderboard data
    await this.loadLeaderboard();
    
    const modal = this.createModal('🏆 Weekly Leaderboard', `
      <div style="margin-bottom: 20px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="color: #999; font-size: 12px;">Current Week Rankings</div>
          <div style="color: #10B981; font-size: 14px; font-weight: 600;">
            Resets every Monday
          </div>
        </div>
        
        <div id="leaderboard-list">
          ${this.renderLeaderboard()}
        </div>
        
        <div style="background: #1f2937; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="color: white; font-weight: 600;">${this.userName}</div>
              <div style="color: #666; font-size: 12px;">Your Position</div>
            </div>
            <div style="text-align: right;">
              <div style="color: #10B981; font-size: 18px; font-weight: 700;">${this.userPoints}</div>
              <div style="color: #666; font-size: 12px;">points</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="display: flex; gap: 8px;">
        <button id="refresh-leaderboard" style="
          flex: 1;
          padding: 10px;
          background: #374151;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        ">Refresh</button>
        <button id="close-leaderboard" style="
          flex: 1;
          padding: 10px;
          background: #10B981;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        ">Close</button>
      </div>
    `);

    modal.querySelector('#refresh-leaderboard').addEventListener('click', async () => {
      await this.loadLeaderboard();
      modal.querySelector('#leaderboard-list').innerHTML = this.renderLeaderboard();
    });

    modal.querySelector('#close-leaderboard').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    document.body.appendChild(modal);
  }

  async loadLeaderboard() {
    try {
      // In a real implementation, this would fetch from an API
      // For demo, we'll create mock data
      this.leaderboardData = this.generateMockLeaderboard();
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      this.leaderboardData = [];
    }
  }

  generateMockLeaderboard() {
    const names = [
      'CyberGuardian', 'SecurityPro', 'PasswordMaster', 'CryptoNinja', 
      'SafetyFirst', 'TechDefender', 'SecureUser', 'DigitalWarrior',
      'PrivacyPro', 'DataProtector', 'SecurityExpert', 'CyberSentry'
    ];
    
    const mockUsers = names.map((name, index) => ({
      userId: `mock_${index}`,
      userName: name,
      points: Math.floor(Math.random() * 200) + 50,
      lastActive: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000
    }));
    
    // Add current user if not in mock data
    const userInList = mockUsers.find(u => u.userId === this.userId);
    if (!userInList) {
      mockUsers.push({
        userId: this.userId,
        userName: this.userName,
        points: this.userPoints,
        lastActive: Date.now()
      });
    }
    
    // Sort by points
    return mockUsers.sort((a, b) => b.points - a.points);
  }

  renderLeaderboard() {
    if (!this.leaderboardData.length) {
      return '<div style="text-align: center; color: #666; padding: 20px;">Loading...</div>';
    }
    
    const topThree = this.leaderboardData.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    
    return topThree.map((user, index) => {
      const isCurrentUser = user.userId === this.userId;
      
      return `
        <div style="
          display: flex;
          align-items: center;
          padding: 16px;
          margin-bottom: 8px;
          background: ${isCurrentUser ? 'linear-gradient(135deg, #1f2937 0%, #10B981 20%)' : '#2a2a2a'};
          border-radius: 12px;
          border: ${isCurrentUser ? '2px solid #10B981' : '1px solid #404040'};
        ">
          <div style="font-size: 24px; margin-right: 16px;">
            ${medals[index]}
          </div>
          <div style="flex: 1;">
            <div style="color: white; font-weight: 600; font-size: 14px;">
              ${user.userName}${isCurrentUser ? ' (You)' : ''}
            </div>
            <div style="color: #666; font-size: 11px;">
              ${this.formatTimeAgo(user.lastActive)}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="color: #10B981; font-size: 18px; font-weight: 700;">
              ${user.points}
            </div>
            <div style="color: #666; font-size: 10px;">points</div>
          </div>
        </div>
      `;
    }).join('');
  }

  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  // UI Helper Methods
  createModal(title, content, closeable = true) {
    const modal = document.createElement('div');
    modal.className = 'lockdown-modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
      <div class="modal-content" style="
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        border: 1px solid #444;
        box-shadow: 0 20px 40px rgba(0,0,0,0.6);
        animation: slideIn 0.3s ease;
      ">
        <h3 style="color: white; margin-bottom: 16px; font-size: 18px; font-weight: 700;">
          ${title}
        </h3>
        ${content}
      </div>
    `;
    
    // Add animations if not already present
    if (!document.getElementById('lockdown-game-animations')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-game-animations';
      styles.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: scale(0.9) translateY(-20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    if (closeable) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
    }
    
    return modal;
  }

  createFloatingNotification(title, message, buttons = []) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
      border: 2px solid #10B981;
      border-radius: 16px;
      padding: 20px;
      max-width: 320px;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
      animation: slideInRight 0.4s ease;
    `;
    
    const buttonsHtml = buttons.map((btn, index) => `
      <button class="notif-btn-${index}" style="
        padding: 8px 16px;
        margin-right: 8px;
        background: ${btn.primary ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'transparent'};
        color: ${btn.primary ? 'white' : '#999'};
        border: ${btn.primary ? 'none' : '1px solid #444'};
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: ${btn.primary ? '600' : 'normal'};
      ">${btn.text}</button>
    `).join('');
    
    notification.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="color: #10B981; font-weight: 700; font-size: 14px; margin-bottom: 4px;">
          ${title}
        </div>
        <div style="color: #999; font-size: 12px;">
          ${message}
        </div>
      </div>
      <div>${buttonsHtml}</div>
    `;
    
    // Add button event listeners
    buttons.forEach((btn, index) => {
      const btnEl = notification.querySelector(`.notif-btn-${index}`);
      if (btnEl) {
        btnEl.addEventListener('click', btn.action);
      }
    });
    
    // Add slide-in animation
    if (!document.getElementById('lockdown-notification-animations')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-notification-animations';
      styles.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds if no interaction
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
    
    return notification;
  }

  // Public API methods
  async getUserStats() {
    return {
      points: this.userPoints,
      userName: this.userName,
      lastQuizTime: this.lastQuizTime,
      nextQuizAvailable: this.lastQuizTime + this.quizCooldown
    };
  }

  async forceQuiz() {
    // Admin/testing method to trigger quiz immediately
    this.lastQuizTime = 0;
    this.checkQuizAvailability();
  }
}

// Initialize game system when extension loads
let lockdownGameSystem = null;

// Only initialize if this is the main extension context (not popup)
if (typeof window !== 'undefined' && window.location) {
  document.addEventListener('DOMContentLoaded', () => {
    lockdownGameSystem = new LockdownGameSystem();
  });
}

// Export for use in other parts of the extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LockdownGameSystem;
}
