// content.js - Updated content script with gamification integration

class LockdownContent {
  constructor() {
    this.domain = window.location.hostname;
    this.forms = new Map();
    this.gameSystem = null;
    this.init();
  }

  init() {
    console.log('Lockdown content script loaded for:', this.domain);
    
    // Find forms on page load
    this.scanForms();
    
    // Watch for new forms
    this.observeChanges();
    
    // Listen for messages from popup and background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Keep channel open for async responses
    });

    // Wait for gamification system to be ready
    this.waitForGameSystem();
  }

  waitForGameSystem() {
    // Check if gamification system is loaded
    const checkGameSystem = () => {
      if (window.lockdownGameSystem) {
        this.gameSystem = window.lockdownGameSystem;
        console.log('Game system connected to content script');
      } else {
        setTimeout(checkGameSystem, 100);
      }
    };
    
    setTimeout(checkGameSystem, 500); // Give gamification.js time to load
  }

  scanForms() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => this.analyzeForm(form));
    
    // Also check standalone password fields
    const passwordFields = document.querySelectorAll('input[type="password"]');
    passwordFields.forEach(field => {
      if (!field.closest('form')) {
        this.addAutofillButton(field);
      }
    });
  }

  analyzeForm(form) {
    const passwordField = form.querySelector('input[type="password"]');
    const usernameField = form.querySelector('input[type="text"], input[type="email"]') ||
                         form.querySelector('input[name*="user"], input[name*="email"]');
    
    if (passwordField) {
      const formData = {
        form,
        passwordField,
        usernameField,
        isLogin: !form.querySelector('input[type="password"]:nth-of-type(2)') // No confirm password = login
      };
      
      this.forms.set(form, formData);
      this.addAutofillButton(passwordField);
      
      // For registration forms, add password suggestion
      if (!formData.isLogin) {
        this.addPasswordSuggestion(passwordField);
      }
    }
  }

  addAutofillButton(passwordField) {
    if (passwordField.lockdownButton) return;
    
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '🔒';
    button.title = 'Fill with Lockdown';
    button.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      background: #333;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      z-index: 9999;
      font-size: 12px;
    `;
    
    // Position the field relatively
    passwordField.style.position = 'relative';
    passwordField.style.paddingRight = '35px';
    
    // Add button
    passwordField.parentNode.style.position = 'relative';
    passwordField.parentNode.appendChild(button);
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.requestAutofill(passwordField);
    });
    
    passwordField.lockdownButton = button;
  }

  addPasswordSuggestion(passwordField) {
    if (passwordField.lockdownSuggestion) return;
    
    const suggestion = document.createElement('div');
    suggestion.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 16px;
      z-index: 10000;
      display: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    
    suggestion.innerHTML = `
      <div style="color: white; font-size: 14px; margin-bottom: 12px;">
        <strong>🔒 Lockdown suggests a strong password</strong>
        <p style="color: #999; font-size: 12px; margin: 4px 0;">Generated passwords are automatically saved to your vault.</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="useStrong" style="flex: 1; padding: 8px; background: #10B981; color: white; border: none; border-radius: 6px; cursor: pointer;">Use Strong Password</button>
        <button id="chooseOwn" style="flex: 1; padding: 8px; background: transparent; color: #999; border: 1px solid #333; border-radius: 6px; cursor: pointer;">Choose My Own</button>
      </div>
    `;
    
    // Position relative to password field
    passwordField.parentNode.style.position = 'relative';
    passwordField.parentNode.appendChild(suggestion);
    
    // Show on focus
    passwordField.addEventListener('focus', () => {
      if (!passwordField.value) {
        suggestion.style.display = 'block';
      }
    });
    
    // Hide when typing
    passwordField.addEventListener('input', () => {
      suggestion.style.display = 'none';
    });
    
    // Button handlers
    suggestion.querySelector('#useStrong').addEventListener('click', () => {
      this.generateAndFillPassword(passwordField);
      suggestion.style.display = 'none';
    });
    
    suggestion.querySelector('#chooseOwn').addEventListener('click', () => {
      suggestion.style.display = 'none';
      passwordField.focus();
    });
    
    // Hide when clicking outside
    document.addEventListener('click', (e) => {
      if (!passwordField.contains(e.target) && !suggestion.contains(e.target)) {
        suggestion.style.display = 'none';
      }
    });
    
    passwordField.lockdownSuggestion = suggestion;
  }

  async generateAndFillPassword(passwordField) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_PASSWORD',
        length: 32
      });
      
      if (response && response.password) {
        // Fill password field
        passwordField.value = response.password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Fill confirm password if exists
        const form = passwordField.closest('form');
        if (form) {
          const confirmField = form.querySelector('input[type="password"]:not([type="password"]:first-of-type)');
          if (confirmField) {
            confirmField.value = response.password;
            confirmField.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        this.showNotification('Strong password generated! 🎯 Complete the quiz to earn points!', 'success');
      }
    } catch (error) {
      console.error('Password generation failed:', error);
      this.showNotification('Failed to generate password', 'error');
    }
  }

  async requestAutofill(passwordField) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CREDENTIALS',
        domain: this.domain
      });
      
      if (response && response.credentials && response.credentials.length > 0) {
        const credential = response.credentials[0]; // Use first match
        this.performAutofill(passwordField, credential);
      } else {
        this.showNotification('No credentials found for this site', 'info');
      }
    } catch (error) {
      console.error('Autofill failed:', error);
      this.showNotification('Autofill failed', 'error');
    }
  }

  performAutofill(passwordField, credential) {
    try {
      const form = passwordField.closest('form');
      let filledFields = 0;
      
      // Fill password
      passwordField.value = credential.password;
      passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      passwordField.dispatchEvent(new Event('change', { bubbles: true }));
      filledFields++;
      
      // Fill username/email
      if (form) {
        const usernameField = form.querySelector('input[type="text"], input[type="email"]') ||
                            form.querySelector('input[name*="user"], input[name*="email"], input[name*="login"]');
        
        if (usernameField && credential.username) {
          usernameField.value = credential.username;
          usernameField.dispatchEvent(new Event('input', { bubbles: true }));
          usernameField.dispatchEvent(new Event('change', { bubbles: true }));
          filledFields++;
        }
      }
      
      this.showNotification(`Filled ${filledFields} field(s) - Check out the daily quiz for points! 🏆`, 'success');
      
      // Focus submit button if available
      const submitBtn = form?.querySelector('button[type="submit"], input[type="submit"]') ||
                       form?.querySelector('button:not([type]), button[type="button"]');
      if (submitBtn) {
        setTimeout(() => submitBtn.focus(), 100);
      }
      
    } catch (error) {
      console.error('Autofill error:', error);
      this.showNotification('Autofill failed', 'error');
    }
  }

  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'FORM' || node.querySelector && node.querySelector('form')) {
              shouldRescan = true;
            }
          }
        });
      });
      
      if (shouldRescan) {
        setTimeout(() => this.scanForms(), 100);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async handleMessage(message, sendResponse) {
    console.log('Content script received message:', message.type);
    
    try {
      switch (message.type) {
        case 'AUTOFILL':
          const passwordField = document.querySelector('input[type="password"]');
          if (passwordField && message.credential) {
            this.performAutofill(passwordField, message.credential);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No password field found' });
          }
          break;
          
        case 'GET_GAME_STATS':
          if (this.gameSystem) {
            const stats = await this.gameSystem.getUserStats();
            sendResponse({ success: true, stats });
          } else {
            sendResponse({ success: false, error: 'Game system not ready' });
          }
          break;
          
        case 'START_QUIZ':
          if (this.gameSystem) {
            await this.gameSystem.startQuiz();
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Game system not ready' });
          }
          break;
          
        case 'SHOW_LEADERBOARD':
          if (this.gameSystem) {
            await this.gameSystem.showLeaderboard();
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Game system not ready' });
          }
          break;
          
        case 'FORCE_QUIZ':
          if (this.gameSystem) {
            await this.gameSystem.forceQuiz();
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Game system not ready' });
          }
          break;
          
        case 'VAULT_UNLOCKED':
          // Refresh gamification system when vault is unlocked
          if (this.gameSystem) {
            await this.gameSystem.loadUserData();
            this.showNotification('🎯 Daily quiz available! Earn points and compete on the leaderboard!', 'info');
          }
          sendResponse({ success: true });
          break;
          
        case 'VAULT_LOCKED':
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      animation: slideIn 0.3s ease;
      line-height: 1.4;
    `;
    
    // Set colors based on type
    switch (type) {
      case 'success':
        notification.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
        break;
      case 'error':
        notification.style.background = '#EF4444';
        break;
      case 'info':
        notification.style.background = 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)';
        break;
    }
    
    notification.innerHTML = message;
    
    // Add animation keyframes
    if (!document.querySelector('#lockdown-styles')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-styles';
      styles.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { 
            opacity: 1; 
            transform: scale(1);
          }
          50% { 
            opacity: 0.8; 
            transform: scale(1.02);
          }
        }
      `;
      document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Remove after 4 seconds (longer for gamification messages)
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.lockdownContent = new LockdownContent();
  });
} else {
  window.lockdownContent = new LockdownContent();
}
