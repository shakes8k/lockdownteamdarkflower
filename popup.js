// popup.js - Enhanced Lockdown popup with gamification features

class LockdownPopup {
  constructor() {
    this.isUnlocked = false;
    this.credentials = [];
    this.currentDomain = '';
    this.countdownUpdateInterval = null;
    this.gameSystem = null;
    this.userStats = null;
    
    this.init();
  }

  async init() {
    console.log('Initializing popup...');
    
    try {
      await this.getCurrentDomain();
      await this.loadGameStats();
      await this.checkStatus();
      
      // Start countdown updates if unlocked
      if (this.isUnlocked) {
        this.startCountdownUpdates();
      }
      
      console.log('Popup ready');
      
    } catch (error) {
      console.error('Popup initialization failed:', error);
    }
  }

  async loadGameStats() {
    try {
      // Get game stats from content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_GAME_STATS' });
        if (response && response.stats) {
          this.userStats = response.stats;
        }
      }
    } catch (error) {
      console.log('Game stats not available (content script may not be loaded)');
      // Create default stats
      this.userStats = {
        points: 0,
        userName: 'Player',
        lastQuizTime: 0,
        nextQuizAvailable: Date.now()
      };
    }
  }

  async getCurrentDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        const url = new URL(tab.url);
        this.currentDomain = url.hostname;
      } else {
        this.currentDomain = 'extension';
      }
      
      const domainEl = document.getElementById('currentDomain');
      if (domainEl) domainEl.textContent = this.currentDomain;
      
    } catch (error) {
      console.error('Failed to get domain:', error);
      this.currentDomain = 'unknown';
    }
  }

  async checkStatus() {
    try {
      const setupResult = await chrome.storage.local.get(['setupCompleted']);
      const hasSetup = setupResult.setupCompleted;

      if (!hasSetup) {
        this.showSetup();
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      
      if (response.isUnlocked) {
        this.isUnlocked = true;
        await this.showUnlocked();
      } else {
        this.showLocked();
      }
    } catch (error) {
      console.error('Status check failed:', error);
      this.showLocked();
    }
  }

  showSetup() {
    const setupHtml = `
      <div class="setup-container">
        <h2>Welcome to Lockdown</h2>
        <p>Create your master password to get started and unlock gamified security learning!</p>
        
        <div class="game-preview" style="
          background: linear-gradient(135deg, #10B981 10%, #059669 100%);
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
          text-align: center;
        ">
          <div style="font-size: 32px; margin-bottom: 8px;">🏆</div>
          <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
            Gamified Learning Awaits!
          </div>
          <div style="color: rgba(255,255,255,0.8); font-size: 12px;">
            Daily quizzes • Points & Leaderboards • Security mastery
          </div>
        </div>
        
        <div class="input-group">
          <input type="password" id="setupPassword" placeholder="Enter master password" class="password-input">
          <div class="password-strength" id="setupStrength">
            <div class="strength-bar"></div>
          </div>
        </div>
        
        <div class="input-group">
          <input type="password" id="setupConfirm" placeholder="Confirm master password" class="password-input">
        </div>
        
        <button id="createVaultBtn" class="primary-btn" disabled>Create Vault & Start Learning</button>
      </div>
    `;

    this.setMainContent(setupHtml);
    setTimeout(() => this.setupSetupListeners(), 10);
  }

  setupSetupListeners() {
    const passwordInput = document.getElementById('setupPassword');
    const confirmInput = document.getElementById('setupConfirm');
    const createBtn = document.getElementById('createVaultBtn');

    const validateSetup = () => {
      const password = passwordInput.value;
      const confirm = confirmInput.value;
      const isValid = password.length >= 8 && password === confirm;
      
      createBtn.disabled = !isValid;
      this.updatePasswordStrength(password);
    };

    passwordInput.addEventListener('input', validateSetup);
    confirmInput.addEventListener('input', validateSetup);

    createBtn.addEventListener('click', async () => {
      const password = passwordInput.value;
      
      if (password.length < 8) {
        this.showMessage('Password must be at least 8 characters', 'error');
        return;
      }

      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SETUP_VAULT',
          masterPassword: password
        });

        if (response.success) {
          this.isUnlocked = true;
          await this.showUnlocked();
          this.showMessage('Vault created successfully!', 'success');
          this.startCountdownUpdates();
        } else {
          this.showMessage(response.error, 'error');
        }
      } catch (error) {
        this.showMessage('Setup failed: ' + error.message, 'error');
      }

      createBtn.disabled = false;
      createBtn.textContent = 'Create Vault & Start Learning';
    });
  }

  showLocked() {
    this.stopCountdownUpdates();
    
    const lockedHtml = `
      <div class="vault-status locked">
        <div class="vault-icon">🔒</div>
        <h3>Vault Locked</h3>
        <p>Enter your master password</p>
      </div>

      ${this.renderGameStatusCard()}

      <div class="input-group">
        <input type="password" id="masterPassword" placeholder="Master password" class="password-input">
      </div>

      <button id="unlockBtn" class="primary-btn">Unlock Vault</button>
    `;

    this.setMainContent(lockedHtml);
    
    setTimeout(() => {
      const passwordInput = document.getElementById('masterPassword');
      const unlockBtn = document.getElementById('unlockBtn');

      const unlock = async () => {
        const password = passwordInput.value;
        if (!password) return;

        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Unlocking...';

        try {
          const response = await chrome.runtime.sendMessage({
            type: 'UNLOCK_VAULT',
            masterPassword: password
          });

          if (response.success) {
            this.isUnlocked = true;
            await this.showUnlocked();
            this.showMessage('Vault unlocked!', 'success');
            this.startCountdownUpdates();
          } else {
            this.showMessage(response.error, 'error');
          }
        } catch (error) {
          this.showMessage('Unlock failed: ' + error.message, 'error');
        }

        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock Vault';
        passwordInput.value = '';
      };

      if (unlockBtn) unlockBtn.addEventListener('click', unlock);
      if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') unlock();
        });
        passwordInput.focus();
      }
    }, 10);
  }

  async showUnlocked() {
    await this.loadCredentials();
    
    const unlockedHtml = `
      <div class="vault-status unlocked">
        <div class="vault-icon">
          <img src="icons/vault_icon-removebg-preview.png" alt="Unlocked" class="vault-logo">
        </div>
        <h3>Welcome to Lockdown</h3>
        <p>Your passwords are ready</p>
      </div>

      <div id="countdown" class="countdown-display hidden"></div>

      ${this.renderGameStatusCard()}

      <div class="quick-actions">
        <button id="generateBtn" class="action-btn">
          <div class="icon">🔑</div>
          <div class="label">Generate</div>
        </button>
        <button id="addBtn" class="action-btn">
          <div class="icon">➕</div>
          <div class="label">Add New</div>
        </button>
        <button id="quizBtn" class="action-btn quiz-action">
          <div class="icon">🎯</div>
          <div class="label">Daily Quiz</div>
        </button>
        <button id="leaderboardBtn" class="action-btn leaderboard-action">
          <div class="icon">🏆</div>
          <div class="label">Leaderboard</div>
        </button>
      </div>

      <div class="credentials-section">
        <div class="section-title">
          <span>Current Site</span>
          <span id="currentDomain">${this.currentDomain}</span>
        </div>
        <div id="currentCredentials"></div>
      </div>

      <div class="credentials-section">
        <div class="section-title">
          <span>All Passwords</span>
          <span>${this.credentials.length}</span>
        </div>
        <div id="allCredentials"></div>
      </div>

      <div class="actions">
        <button id="settingsBtn" class="secondary-btn">Settings</button>
        <button id="lockBtn" class="secondary-btn">Lock Vault</button>
      </div>
    `;

    this.setMainContent(unlockedHtml);
    
    setTimeout(() => {
      this.displayCredentials();
      this.setupUnlockedListeners();
      this.updateQuizButtonState();
    }, 10);
  }

  renderGameStatusCard() {
    if (!this.userStats) return '';
    
    const isQuizAvailable = Date.now() >= this.userStats.nextQuizAvailable;
    const timeUntilQuiz = this.userStats.nextQuizAvailable - Date.now();
    
    return `
      <div class="game-status-card" style="
        background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
        border: 1px solid #10B981;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 16px;
        text-align: center;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="color: #10B981; font-weight: 600; font-size: 14px;">
            🎮 ${this.userStats.userName}
          </div>
          <div style="color: #10B981; font-size: 18px; font-weight: 700;">
            ${this.userStats.points} pts
          </div>
        </div>
        
        <div style="color: #999; font-size: 12px;">
          ${isQuizAvailable 
            ? '🎯 Daily quiz available now!'
            : `⏰ Next quiz in ${this.formatTimeRemaining(timeUntilQuiz)}`}
        </div>
        
        ${isQuizAvailable ? `
          <div style="margin-top: 8px;">
            <div style="
              display: inline-block;
              padding: 4px 8px;
              background: linear-gradient(135deg, #10B981 0%, #059669 100%);
              border-radius: 12px;
              color: white;
              font-size: 10px;
              font-weight: 600;
              animation: pulse 2s infinite;
            ">
              NEW QUIZ READY!
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  formatTimeRemaining(milliseconds) {
    const hours = Math.floor(milliseconds / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  updateQuizButtonState() {
    const quizBtn = document.getElementById('quizBtn');
    if (!quizBtn || !this.userStats) return;
    
    const isQuizAvailable = Date.now() >= this.userStats.nextQuizAvailable;
    
    if (isQuizAvailable) {
      quizBtn.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
      quizBtn.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.4)';
      quizBtn.style.animation = 'pulse 2s infinite';
    } else {
      quizBtn.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)';
      quizBtn.style.boxShadow = 'none';
      quizBtn.style.animation = 'none';
    }
  }

  async loadCredentials() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CREDENTIALS',
        domain: this.currentDomain
      });
      
      this.credentials = response.credentials || [];
    } catch (error) {
      console.error('Failed to load credentials:', error);
      this.credentials = [];
    }
  }

  displayCredentials() {
    const currentContainer = document.getElementById('currentCredentials');
    const allContainer = document.getElementById('allCredentials');
    
    if (!currentContainer || !allContainer) {
      console.error('Credential containers not found');
      return;
    }
    
    const currentCreds = this.credentials.filter(cred => 
      cred.domain === this.currentDomain
    );
    
    if (currentCreds.length === 0) {
      currentContainer.innerHTML = '<p class="no-credentials">No credentials for this site</p>';
    } else {
      currentContainer.innerHTML = currentCreds.map(cred => 
        this.createCredentialHtml(cred, true)
      ).join('');
    }

    if (this.credentials.length === 0) {
      allContainer.innerHTML = '<p class="no-credentials">No saved passwords</p>';
    } else {
      allContainer.innerHTML = this.credentials.slice(0, 5).map(cred => 
        this.createCredentialHtml(cred, false)
      ).join('');
    }
  }

  createCredentialHtml(cred, showAutofill) {
    return `
      <div class="credential-item">
        <div class="credential-info">
          <div class="credential-details">
            <h4>${this.escapeHtml(cred.name || cred.domain)}</h4>
            <p>${this.escapeHtml(cred.username || cred.email || 'No username')}</p>
          </div>
          <div class="credential-actions">
            ${showAutofill ? '<button class="icon-btn autofill" onclick="lockdownPopup.autofill(\'' + cred.id + '\')">↗️</button>' : ''}
            <button class="icon-btn copy" onclick="lockdownPopup.copyPassword('${cred.id}')">📋</button>
          </div>
        </div>
      </div>
    `;
  }

  setupUnlockedListeners() {
    console.log('Setting up unlocked listeners...');
    
    const setupListener = (id, handler, description) => {
      const element = document.getElementById(id);
      if (element) {
        console.log(`Adding listener for ${description}`);
        element.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`${description} button clicked`);
          try {
            handler();
          } catch (error) {
            console.error(`Error in ${description} handler:`, error);
            this.showMessage(`Error: ${error.message}`, 'error');
          }
        });
      } else {
        console.error(`Element ${id} not found for ${description}`);
      }
    };

    setupListener('generateBtn', () => this.showPasswordGenerator(), 'password generator');
    setupListener('addBtn', () => this.showAddCredential(), 'add credential');
    setupListener('quizBtn', () => this.startQuiz(), 'daily quiz');
    setupListener('leaderboardBtn', () => this.showLeaderboard(), 'leaderboard');
    setupListener('settingsBtn', () => this.showSettings(), 'settings');
    setupListener('lockBtn', () => this.lockVault(), 'lock vault');
    
    console.log('Finished setting up listeners');
  }

  async startQuiz() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'START_QUIZ' });
      this.showMessage('Opening daily quiz...', 'success');
      // Close popup so user can see the quiz
      window.close();
    } catch (error) {
      console.error('Failed to start quiz:', error);
      this.showMessage('Failed to start quiz. Please refresh the page.', 'error');
    }
  }

  async showLeaderboard() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LEADERBOARD' });
      this.showMessage('Opening leaderboard...', 'info');
      // Keep popup open for leaderboard
    } catch (error) {
      console.error('Failed to show leaderboard:', error);
      this.showMessage('Failed to show leaderboard. Please refresh the page.', 'error');
    }
  }

  showPasswordGenerator() {
    console.log('Opening password generator...');
    
    try {
      const modal = this.createModal('Generate Password', `
        <div class="generator-options">
          <div class="option-group">
            <label>Length: <span id="lengthValue">32</span></label>
            <input type="range" id="lengthSlider" min="8" max="64" value="32">
          </div>
          
          <div class="option-group">
            <label><input type="checkbox" id="includeSymbols" checked> Include symbols</label>
          </div>
        </div>
        
        <div class="generated-password">
          <input type="text" id="generatedPassword" readonly>
          <button id="copyGenerated" class="icon-btn">📋</button>
        </div>
        
        <div class="modal-actions">
          <button id="regenerate" class="secondary-btn">Generate New</button>
          <button id="closeGenerator" class="primary-btn">Close</button>
        </div>
      `);

      const generate = async () => {
        try {
          const length = document.getElementById('lengthSlider').value;
          console.log('Generating password with length:', length);
          
          const response = await chrome.runtime.sendMessage({
            type: 'GENERATE_PASSWORD',
            length: parseInt(length)
          });
          
          if (response && response.password) {
            document.getElementById('generatedPassword').value = response.password;
            console.log('Password generated successfully');
          } else {
            console.error('No password in response:', response);
            this.showMessage('Failed to generate password', 'error');
          }
        } catch (error) {
          console.error('Password generation error:', error);
          this.showMessage('Failed to generate password: ' + error.message, 'error');
        }
      };

      const lengthSlider = modal.querySelector('#lengthSlider');
      const lengthValue = modal.querySelector('#lengthValue');
      const regenerateBtn = modal.querySelector('#regenerate');
      const copyBtn = modal.querySelector('#copyGenerated');
      const closeBtn = modal.querySelector('#closeGenerator');

      if (lengthSlider && lengthValue) {
        lengthSlider.addEventListener('input', (e) => {
          lengthValue.textContent = e.target.value;
        });
      }
      
      if (regenerateBtn) regenerateBtn.addEventListener('click', generate);
      
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const password = modal.querySelector('#generatedPassword').value;
          if (password) {
            try {
              await navigator.clipboard.writeText(password);
              this.showMessage('Password copied!', 'success');
            } catch (error) {
              console.error('Copy failed:', error);
              this.showMessage('Failed to copy password', 'error');
            }
          }
        });
      }
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          try {
            document.body.removeChild(modal);
          } catch (error) {
            console.error('Error closing modal:', error);
          }
        });
      }

      document.body.appendChild(modal);
      generate();
      
    } catch (error) {
      console.error('Error in showPasswordGenerator:', error);
      this.showMessage('Failed to open password generator', 'error');
    }
  }

  showAddCredential() {
    console.log('Opening add credential form...');
    
    try {
      const modal = this.createModal('Add Credential', `
        <div class="form-group">
          <input type="text" id="credName" placeholder="Site name" value="${this.currentDomain}">
        </div>
        
        <div class="form-group">
          <input type="text" id="credUsername" placeholder="Username or email">
        </div>
        
        <div class="form-group" style="position: relative;">
          <input type="password" id="credPassword" placeholder="Password" style="padding-right: 40px;">
          <button type="button" id="generateForCred" class="icon-btn" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%);">🔑</button>
        </div>
        
        <div class="modal-actions">
          <button id="cancelAdd" class="secondary-btn">Cancel</button>
          <button id="saveCredential" class="primary-btn">Save</button>
        </div>
      `);

      const generateBtn = modal.querySelector('#generateForCred');
      const saveBtn = modal.querySelector('#saveCredential');
      const cancelBtn = modal.querySelector('#cancelAdd');

      if (generateBtn) {
        generateBtn.addEventListener('click', async () => {
          try {
            const response = await chrome.runtime.sendMessage({ type: 'GENERATE_PASSWORD' });
            if (response && response.password) {
              modal.querySelector('#credPassword').value = response.password;
              console.log('Password generated for credential');
            }
          } catch (error) {
            console.error('Password generation failed:', error);
            this.showMessage('Failed to generate password', 'error');
          }
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const name = modal.querySelector('#credName').value;
          const username = modal.querySelector('#credUsername').value;
          const password = modal.querySelector('#credPassword').value;

          if (!name || !username || !password) {
            this.showMessage('Please fill all fields', 'error');
            return;
          }

          const credential = {
            name,
            domain: this.currentDomain,
            username,
            password,
            url: `https://${this.currentDomain}`
          };

          try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            const response = await chrome.runtime.sendMessage({
              type: 'SAVE_CREDENTIAL',
              credential
            });

            if (response.success) {
              await this.loadCredentials();
              this.displayCredentials();
              document.body.removeChild(modal);
              this.showMessage('Credential saved!', 'success');
            } else {
              this.showMessage(response.error, 'error');
            }
          } catch (error) {
            console.error('Save failed:', error);
            this.showMessage('Save failed: ' + error.message, 'error');
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
          }
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          try {
            document.body.removeChild(modal);
          } catch (error) {
            console.error('Error closing modal:', error);
          }
        });
      }

      document.body.appendChild(modal);
      
      setTimeout(() => {
        const usernameField = modal.querySelector('#credUsername');
        if (usernameField) usernameField.focus();
      }, 100);
      
    } catch (error) {
      console.error('Error in showAddCredential:', error);
      this.showMessage('Failed to open add credential form', 'error');
    }
  }

  showSettings() {
    console.log('Settings button clicked');
    
    try {
      const modal = this.createModal('Settings', `
        <div class="setting-group">
          <label>Auto-lock delay:</label>
          <select id="autoLockSelect">
            <option value="300000">5 minutes</option>
            <option value="600000">10 minutes</option>
            <option value="900000">15 minutes</option>
            <option value="1800000">30 minutes</option>
            <option value="never">Never</option>
          </select>
        </div>
        
        <div class="setting-group">
          <label>Quiz & Game Settings:</label>
          <button id="forceQuiz" class="secondary-btn" style="width: 100%; margin-bottom: 8px;">
            🎯 Force Quiz (Testing)
          </button>
          <div style="color: #666; font-size: 11px; text-align: center;">
            Points: ${this.userStats?.points || 0} | Player: ${this.userStats?.userName || 'Unknown'}
          </div>
        </div>
        
        <div class="modal-actions">
          <button id="closeSettings" class="primary-btn">Close</button>
        </div>
      `);

      chrome.runtime.sendMessage({ type: 'GET_STATUS' })
        .then(response => {
          const selectElement = modal.querySelector('#autoLockSelect');
          if (selectElement && response && response.autoLockDelay !== undefined) {
            selectElement.value = response.autoLockDelay || 'never';
          }
        })
        .catch(error => {
          console.error('Failed to get current settings:', error);
        });

      const selectElement = modal.querySelector('#autoLockSelect');
      const forceQuizBtn = modal.querySelector('#forceQuiz');
      const closeButton = modal.querySelector('#closeSettings');

      if (selectElement) {
        selectElement.addEventListener('change', async (e) => {
          try {
            const response = await chrome.runtime.sendMessage({
              type: 'UPDATE_AUTO_LOCK',
              delay: e.target.value
            });
            
            if (response && response.success) {
              this.showMessage('Settings saved!', 'success');
              setTimeout(() => this.updateCountdownDisplay(), 500);
            } else {
              this.showMessage('Failed to save settings', 'error');
            }
          } catch (error) {
            console.error('Settings save error:', error);
            this.showMessage('Failed to save settings', 'error');
          }
        });
      }

      if (forceQuizBtn) {
        forceQuizBtn.addEventListener('click', async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_QUIZ' });
            document.body.removeChild(modal);
            this.showMessage('Quiz triggered!', 'success');
            window.close();
          } catch (error) {
            console.error('Force quiz failed:', error);
            this.showMessage('Failed to trigger quiz', 'error');
          }
        });
      }

      if (closeButton) {
        closeButton.addEventListener('click', () => {
          try {
            document.body.removeChild(modal);
          } catch (error) {
            console.error('Error closing modal:', error);
          }
        });
      }

      document.body.appendChild(modal);
      console.log('Modal added to page');

    } catch (error) {
      console.error('Error in showSettings:', error);
      this.showMessage('Failed to open settings', 'error');
    }
  }

  async copyPassword(credId) {
    const cred = this.credentials.find(c => c.id === credId);
    if (cred) {
      try {
        await navigator.clipboard.writeText(cred.password);
        this.showMessage('Password copied!', 'success');
      } catch (error) {
        console.error('Copy failed:', error);
        this.showMessage('Failed to copy password', 'error');
      }
    }
  }

  async autofill(credId) {
    const cred = this.credentials.find(c => c.id === credId);
    if (!cred) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        type: 'AUTOFILL',
        credential: cred
      });
      this.showMessage('Autofilled!', 'success');
    } catch (error) {
      console.error('Autofill failed:', error);
      this.showMessage('Autofill failed', 'error');
    }
  }

  async lockVault() {
    try {
      await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
      this.isUnlocked = false;
      this.stopCountdownUpdates();
      this.showLocked();
    } catch (error) {
      this.showMessage('Lock failed', 'error');
    }
  }

  startCountdownUpdates() {
    console.log('Starting countdown updates...');
    
    if (this.countdownUpdateInterval) {
      clearInterval(this.countdownUpdateInterval);
    }
    
    if (!this.isUnlocked) {
      console.log('Not unlocked, skipping countdown updates');
      return;
    }

    this.updateCountdownDisplay();

    this.countdownUpdateInterval = setInterval(() => {
      this.updateCountdownDisplay();
    }, 1000);
    
    console.log('Countdown updates started with 1-second interval');
  }

  stopCountdownUpdates() {
    console.log('Stopping countdown updates');
    if (this.countdownUpdateInterval) {
      clearInterval(this.countdownUpdateInterval);
      this.countdownUpdateInterval = null;
    }
    this.hideCountdown();
  }

  async updateCountdownDisplay() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_REMAINING_TIME' });
      
      if (!response) {
        console.log('No response from background script');
        return;
      }

      if (response.remaining === null || response.remaining === undefined) {
        console.log('Auto-lock disabled, hiding countdown');
        this.hideCountdown();
        return;
      }

      if (response.remaining <= 0) {
        console.log('Time expired, vault should be locked');
        this.isUnlocked = false;
        this.stopCountdownUpdates();
        this.showLocked();
        return;
      }

      const minutes = Math.max(0, response.remainingMinutes || 0);
      const seconds = Math.max(0, response.remainingSeconds || 0);
      const totalSeconds = Math.max(0, response.totalSeconds || 0);

      this.showCountdown(minutes, seconds, totalSeconds);
      
    } catch (error) {
      console.error('Countdown update failed:', error);
    }
  }

  showCountdown(minutes, seconds, totalSeconds) {
    const countdownEl = document.getElementById('countdown');
    if (!countdownEl) {
      console.log('Countdown element not found');
      return;
    }

    minutes = Math.max(0, Math.floor(minutes || 0));
    seconds = Math.max(0, Math.floor(seconds || 0));
    totalSeconds = Math.max(0, Math.floor(totalSeconds || 0));

    if (seconds >= 60) {
      const extraMinutes = Math.floor(seconds / 60);
      minutes += extraMinutes;
      seconds = seconds % 60;
    }

    const isUrgent = totalSeconds < 120;
    const isCritical = totalSeconds < 30;

    let timeText;
    if (minutes > 0) {
      const paddedSeconds = seconds.toString().padStart(2, '0');
      timeText = `${minutes}:${paddedSeconds}`;
    } else {
      timeText = `${seconds}s`;
    }

    const indicator = seconds % 2 === 0 ? '●' : '○';
    const text = `${indicator} Auto-lock in ${timeText}`;
    
    let className = 'countdown-display';
    if (isCritical) {
      className += ' urgent critical';
    } else if (isUrgent) {
      className += ' urgent';
    }

    countdownEl.className = className;
    countdownEl.textContent = text;
    countdownEl.classList.remove('hidden');
    
    if (seconds % 10 === 0) {
      console.log(`Countdown: ${text} (${totalSeconds}s remaining)`);
    }
  }

  hideCountdown() {
    const countdownEl = document.getElementById('countdown');
    if (countdownEl) {
      countdownEl.classList.add('hidden');
      console.log('Countdown hidden');
    }
  }

  updatePasswordStrength(password) {
    const strengthEl = document.getElementById('setupStrength');
    if (!strengthEl) return;

    const bar = strengthEl.querySelector('.strength-bar');
    let strength = 'weak';
    
    if (password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) {
      strength = 'strong';
    } else if (password.length >= 8) {
      strength = 'medium';
    }

    bar.className = `strength-bar ${strength}`;
  }

  setMainContent(html) {
    const content = document.querySelector('.content');
    if (content) {
      content.innerHTML = html;
    } else {
      console.error('Content container not found');
    }
  }

  createModal(title, content, closeable = true) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        ${content}
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal && closeable) {
        try {
          document.body.removeChild(modal);
        } catch (error) {
          console.error('Error removing modal:', error);
        }
      }
    });
    
    return modal;
  }

  showMessage(message, type = 'info') {
    console.log(`Showing message: ${message} (${type})`);
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = message;
    
    const container = document.querySelector('.content');
    if (container) {
      container.appendChild(messageEl);
      setTimeout(() => {
        if (messageEl.parentNode) {
          messageEl.parentNode.removeChild(messageEl);
        }
      }, 3000);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.lockdownPopup = new LockdownPopup();
});