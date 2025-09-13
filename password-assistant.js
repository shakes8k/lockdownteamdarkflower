// password-assistant.js - Advanced password management and suggestions

class PasswordAssistant {
  constructor() {
    this.domain = window.location.hostname;
    this.isUnlocked = false;
    this.savedCredentials = [];
    this.activeFields = new Map();
    this.formData = new Map();
    this.savePrompts = new Map();
    this.suggestions = new Map();
    
    this.init();
  }

  async init() {
    console.log('Password Assistant initializing for:', this.domain);
    
    // Check if vault is unlocked
    await this.checkVaultStatus();
    
    // Load saved credentials for this domain
    await this.loadCredentials();
    
    // Set up observers and listeners
    this.setupPasswordFieldObserver();
    this.setupFormSubmissionMonitor();
    this.setupMessageListener();
    
    // Initial scan
    this.scanForPasswordFields();
    
    console.log('Password Assistant ready');
  }

  async checkVaultStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      this.isUnlocked = response.isUnlocked || false;
    } catch (error) {
      console.log('Vault status check failed, assuming locked');
      this.isUnlocked = false;
    }
  }

  async loadCredentials() {
    if (!this.isUnlocked) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_CREDENTIALS',
        domain: this.domain
      });
      
      this.savedCredentials = response.credentials || [];
      console.log(`Loaded ${this.savedCredentials.length} credentials for ${this.domain}`);
    } catch (error) {
      console.error('Failed to load credentials:', error);
      this.savedCredentials = [];
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'VAULT_UNLOCKED':
          this.isUnlocked = true;
          this.loadCredentials();
          this.refreshAllSuggestions();
          break;
        case 'VAULT_LOCKED':
          this.isUnlocked = false;
          this.savedCredentials = [];
          this.hideAllSuggestions();
          break;
      }
    });
  }

  setupPasswordFieldObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.tagName === 'INPUT' && node.type === 'password') {
              shouldRescan = true;
            } else if (node.querySelector && node.querySelector('input[type="password"]')) {
              shouldRescan = true;
            }
          }
        });
      });
      
      if (shouldRescan) {
        setTimeout(() => this.scanForPasswordFields(), 100);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupFormSubmissionMonitor() {
    // Monitor form submissions to detect new passwords
    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (form.tagName !== 'FORM') return;
      
      const passwordField = form.querySelector('input[type="password"]');
      if (!passwordField || !passwordField.value) return;
      
      // Don't prompt if this is just autofill
      if (passwordField.dataset.lockdownAutofilled) return;
      
      const formData = this.extractFormData(form);
      if (formData && this.shouldPromptToSave(formData)) {
        // Small delay to ensure form submission doesn't interfere
        setTimeout(() => {
          this.showSavePrompt(formData);
        }, 1000);
      }
    });

    // Also monitor AJAX form submissions
    this.monitorAjaxSubmissions();
  }

  monitorAjaxSubmissions() {
    // Override fetch to catch AJAX submissions
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const result = await originalFetch.apply(this, args);
      
      // Check if this might be a login/signup request
      if (result.status >= 200 && result.status < 300) {
        setTimeout(() => {
          this.checkForUnsubmittedPasswords();
        }, 500);
      }
      
      return result;
    };

    // Override XMLHttpRequest
    const originalXHR = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function(...args) {
      this.addEventListener('load', () => {
        if (this.status >= 200 && this.status < 300) {
          setTimeout(() => {
            // Check for password fields that might have been submitted via AJAX
            const passwordFields = document.querySelectorAll('input[type="password"]');
            passwordFields.forEach(field => {
              if (field.value && !field.dataset.lockdownAutofilled) {
                const form = field.closest('form');
                if (form) {
                  const formData = this.extractFormData(form);
                  if (formData && this.shouldPromptToSave(formData)) {
                    this.showSavePrompt(formData);
                  }
                }
              }
            });
          }, 500);
        }
      });
      
      return originalXHR.apply(this, args);
    };
  }

  checkForUnsubmittedPasswords() {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    passwordFields.forEach(field => {
      if (field.value && !field.dataset.lockdownAutofilled) {
        const form = field.closest('form');
        const formData = this.extractFormData(form || field.parentElement);
        if (formData && this.shouldPromptToSave(formData)) {
          this.showSavePrompt(formData);
        }
      }
    });
  }

  scanForPasswordFields() {
    const passwordFields = document.querySelectorAll('input[type="password"]');
    
    passwordFields.forEach(field => {
      if (!field.dataset.lockdownProcessed) {
        this.processPasswordField(field);
        field.dataset.lockdownProcessed = 'true';
      }
    });
  }

  processPasswordField(field) {
    const fieldId = this.generateFieldId(field);
    this.activeFields.set(fieldId, field);
    
    // Add event listeners
    field.addEventListener('focus', () => this.onPasswordFieldFocus(field, fieldId));
    field.addEventListener('input', () => this.onPasswordFieldInput(field, fieldId));
    field.addEventListener('blur', () => this.onPasswordFieldBlur(field, fieldId));
    
    // Position suggestion container
    this.createSuggestionContainer(field, fieldId);
  }

  onPasswordFieldFocus(field, fieldId) {
    if (this.isUnlocked && this.savedCredentials.length > 0) {
      this.showPasswordSuggestions(field, fieldId);
    } else if (this.isUnlocked) {
      this.showPasswordGenerator(field, fieldId);
    } else {
      this.showUnlockPrompt(field, fieldId);
    }
  }

  onPasswordFieldInput(field, fieldId) {
    const value = field.value;
    
    // If user starts typing their own password, show save prompt option
    if (value.length > 0 && !field.dataset.lockdownAutofilled) {
      // Debounce to avoid too many prompts
      clearTimeout(field.savePromptTimeout);
      field.savePromptTimeout = setTimeout(() => {
        if (value.length >= 6) { // Minimum reasonable password length
          this.showInlineSaveOption(field, fieldId);
        }
      }, 1000);
    }
    
    // Hide suggestions when user types
    if (value.length > 0) {
      this.hideSuggestions(fieldId);
    }
  }

  onPasswordFieldBlur(field, fieldId) {
    // Delay hiding suggestions to allow clicks
    setTimeout(() => {
      this.hideSuggestions(fieldId);
    }, 200);
  }

  createSuggestionContainer(field, fieldId) {
    if (field.lockdownContainer) return;
    
    const container = document.createElement('div');
    container.id = `lockdown-suggestions-${fieldId}`;
    container.className = 'lockdown-suggestions-container';
    container.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      z-index: 10000;
      display: none;
      margin-top: 4px;
      max-width: 320px;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    
    // Make field container relative
    field.style.position = 'relative';
    const parent = field.parentElement;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    
    parent.appendChild(container);
    field.lockdownContainer = container;
  }

  showPasswordSuggestions(field, fieldId) {
    const container = field.lockdownContainer;
    if (!container) return;
    
    const suggestions = this.savedCredentials.slice(0, 3); // Show top 3
    
    let html = `
      <div style="padding: 16px; border-bottom: 1px solid #333;">
        <div style="color: #10B981; font-weight: 600; font-size: 14px; margin-bottom: 8px;">
          🔒 Lockdown Suggestions
        </div>
        <div style="color: #999; font-size: 12px;">
          Choose a saved password or generate new
        </div>
      </div>
    `;
    
    // Saved passwords
    if (suggestions.length > 0) {
      html += `<div style="padding: 8px 0;">`;
      suggestions.forEach((cred, index) => {
        html += `
          <div class="lockdown-suggestion-item" data-cred-id="${cred.id}" style="
            padding: 12px 16px;
            cursor: pointer;
            transition: background 0.2s;
            border-bottom: ${index < suggestions.length - 1 ? '1px solid #2a2a2a' : 'none'};
          " onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='transparent'">
            <div style="color: white; font-size: 14px; font-weight: 500;">
              ${this.escapeHtml(cred.name || cred.domain)}
            </div>
            <div style="color: #999; font-size: 12px;">
              ${this.escapeHtml(cred.username || cred.email || 'Saved password')}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
    
    // Generate new password option
    html += `
      <div style="padding: 8px;">
        <div class="lockdown-generate-option" style="
          padding: 12px 16px;
          cursor: pointer;
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          border-radius: 8px;
          text-align: center;
          font-weight: 600;
          color: white;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          🔑 Generate Strong Password
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners
    container.querySelectorAll('.lockdown-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const credId = item.dataset.credId;
        this.fillPassword(field, credId);
        this.hideSuggestions(fieldId);
      });
    });
    
    container.querySelector('.lockdown-generate-option').addEventListener('click', () => {
      this.generateAndFillPassword(field);
      this.hideSuggestions(fieldId);
    });
    
    container.style.display = 'block';
  }

  showPasswordGenerator(field, fieldId) {
    const container = field.lockdownContainer;
    if (!container) return;
    
    container.innerHTML = `
      <div style="padding: 16px;">
        <div style="color: #10B981; font-weight: 600; font-size: 14px; margin-bottom: 12px;">
          🔑 Generate Strong Password
        </div>
        <div style="margin-bottom: 12px;">
          <button class="lockdown-generate-btn" style="
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
          " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            Generate Password
          </button>
        </div>
        <div style="color: #666; font-size: 11px; text-align: center;">
          Generated passwords are automatically saved
        </div>
      </div>
    `;
    
    container.querySelector('.lockdown-generate-btn').addEventListener('click', () => {
      this.generateAndFillPassword(field);
      this.hideSuggestions(fieldId);
    });
    
    container.style.display = 'block';
  }

  showUnlockPrompt(field, fieldId) {
    const container = field.lockdownContainer;
    if (!container) return;
    
    container.innerHTML = `
      <div style="padding: 16px; text-align: center;">
        <div style="color: #F59E0B; font-size: 24px; margin-bottom: 8px;">🔒</div>
        <div style="color: white; font-weight: 600; margin-bottom: 4px;">Vault Locked</div>
        <div style="color: #999; font-size: 12px; margin-bottom: 12px;">
          Unlock Lockdown to access saved passwords
        </div>
        <button class="lockdown-unlock-btn" style="
          padding: 8px 16px;
          background: #3B82F6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        ">
          Open Lockdown
        </button>
      </div>
    `;
    
    container.querySelector('.lockdown-unlock-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });
    
    container.style.display = 'block';
  }

  showInlineSaveOption(field, fieldId) {
    // Create a floating save prompt above the field
    let savePrompt = document.getElementById(`lockdown-save-${fieldId}`);
    
    if (savePrompt) return; // Already showing
    
    savePrompt = document.createElement('div');
    savePrompt.id = `lockdown-save-${fieldId}`;
    savePrompt.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
      border: 2px solid #10B981;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 8px;
      z-index: 10000;
      max-width: 300px;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
      animation: slideUp 0.3s ease;
    `;
    
    savePrompt.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="flex: 1;">
          <div style="color: #10B981; font-weight: 600; font-size: 13px; margin-bottom: 2px;">
            🔒 Save to Lockdown?
          </div>
          <div style="color: #999; font-size: 11px;">
            Save this password for ${this.domain}
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-left: 12px;">
          <button class="save-yes" style="
            padding: 6px 12px;
            background: #10B981;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
          ">Save</button>
          <button class="save-no" style="
            padding: 6px 12px;
            background: transparent;
            color: #999;
            border: 1px solid #444;
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
          ">Not now</button>
        </div>
      </div>
    `;
    
    // Add styles for animation if not already added
    if (!document.getElementById('lockdown-animations')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-animations';
      styles.textContent = `
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Position relative to field
    const parent = field.parentElement;
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    
    parent.appendChild(savePrompt);
    
    // Add event listeners
    savePrompt.querySelector('.save-yes').addEventListener('click', () => {
      this.promptForCredentialDetails(field);
      savePrompt.remove();
    });
    
    savePrompt.querySelector('.save-no').addEventListener('click', () => {
      savePrompt.remove();
    });
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (savePrompt.parentElement) {
        savePrompt.remove();
      }
    }, 10000);
  }

  async promptForCredentialDetails(passwordField) {
    const modal = this.createModal('Save Password', `
      <div style="margin-bottom: 16px;">
        <input type="text" id="save-username" placeholder="Username or email" style="
          width: 100%;
          padding: 12px;
          border: 1px solid #444;
          border-radius: 8px;
          background: #2a2a2a;
          color: white;
          margin-bottom: 8px;
        ">
        <input type="text" id="save-name" placeholder="Name for this password" value="${this.domain}" style="
          width: 100%;
          padding: 12px;
          border: 1px solid #444;
          border-radius: 8px;
          background: #2a2a2a;
          color: white;
        ">
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="save-confirm" style="
          flex: 1;
          padding: 12px;
          background: #10B981;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">Save Password</button>
        <button id="save-cancel" style="
          flex: 1;
          padding: 12px;
          background: transparent;
          color: #999;
          border: 1px solid #444;
          border-radius: 8px;
          cursor: pointer;
        ">Cancel</button>
      </div>
    `);
    
    // Try to auto-fill username from form
    const form = passwordField.closest('form');
    const usernameField = form?.querySelector('input[type="email"], input[type="text"]');
    if (usernameField?.value) {
      modal.querySelector('#save-username').value = usernameField.value;
    }
    
    modal.querySelector('#save-confirm').addEventListener('click', async () => {
      const username = modal.querySelector('#save-username').value;
      const name = modal.querySelector('#save-name').value;
      
      if (!username || !name) {
        this.showNotification('Please fill in all fields', 'error');
        return;
      }
      
      const credential = {
        name,
        domain: this.domain,
        username,
        password: passwordField.value,
        url: window.location.href
      };
      
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_CREDENTIAL',
          credential
        });
        
        if (response.success) {
          this.showNotification('Password saved to Lockdown!', 'success');
          await this.loadCredentials(); // Refresh credentials
        } else {
          this.showNotification('Failed to save password', 'error');
        }
      } catch (error) {
        this.showNotification('Failed to save password', 'error');
      }
      
      document.body.removeChild(modal);
    });
    
    modal.querySelector('#save-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    document.body.appendChild(modal);
  }

  async fillPassword(field, credId) {
    const credential = this.savedCredentials.find(c => c.id === credId);
    if (!credential) return;
    
    // Fill password
    field.value = credential.password;
    field.dataset.lockdownAutofilled = 'true';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Fill username if available
    const form = field.closest('form');
    if (form && credential.username) {
      const usernameField = form.querySelector('input[type="email"], input[type="text"]') ||
                          form.querySelector('input[name*="user"], input[name*="email"]');
      
      if (usernameField) {
        usernameField.value = credential.username;
        usernameField.dispatchEvent(new Event('input', { bubbles: true }));
        usernameField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    this.showNotification('Password filled from Lockdown', 'success');
  }

  async generateAndFillPassword(field) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_PASSWORD',
        length: 32
      });
      
      if (response && response.password) {
        field.value = response.password;
        field.dataset.lockdownGenerated = 'true';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Fill confirm password if exists
        const form = field.closest('form');
        if (form) {
          const confirmField = form.querySelector('input[type="password"]:not([type="password"]:first-of-type)');
          if (confirmField) {
            confirmField.value = response.password;
            confirmField.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        this.showNotification('Strong password generated!', 'success');
        
        // Prompt to save after a short delay
        setTimeout(() => {
          this.showInlineSaveOption(field, this.generateFieldId(field));
        }, 1000);
      }
    } catch (error) {
      this.showNotification('Failed to generate password', 'error');
    }
  }

  hideSuggestions(fieldId) {
    const field = this.activeFields.get(fieldId);
    if (field && field.lockdownContainer) {
      field.lockdownContainer.style.display = 'none';
    }
  }

  hideAllSuggestions() {
    this.activeFields.forEach((field, fieldId) => {
      this.hideSuggestions(fieldId);
    });
  }

  refreshAllSuggestions() {
    // Refresh suggestions for focused fields
    this.activeFields.forEach((field, fieldId) => {
      if (document.activeElement === field) {
        this.onPasswordFieldFocus(field, fieldId);
      }
    });
  }

  extractFormData(formElement) {
    if (!formElement) return null;
    
    const passwordField = formElement.querySelector('input[type="password"]');
    const usernameField = formElement.querySelector('input[type="email"], input[type="text"]') ||
                         formElement.querySelector('input[name*="user"], input[name*="email"]');
    
    if (!passwordField || !passwordField.value) return null;
    
    return {
      domain: this.domain,
      url: window.location.href,
      username: usernameField?.value || '',
      password: passwordField.value,
      name: this.domain
    };
  }

  shouldPromptToSave(formData) {
    if (!this.isUnlocked) return false;
    if (!formData || !formData.password) return false;
    
    // Don't prompt if we already have this exact credential
    const exists = this.savedCredentials.some(cred => 
      cred.username === formData.username && cred.password === formData.password
    );
    
    return !exists;
  }

  showSavePrompt(formData) {
    // Create a floating save prompt at the top of the page
    let prompt = document.getElementById('lockdown-page-save-prompt');
    if (prompt) return; // Already showing
    
    prompt = document.createElement('div');
    prompt.id = 'lockdown-page-save-prompt';
    prompt.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
      border: 2px solid #10B981;
      border-radius: 16px;
      padding: 20px 24px;
      z-index: 10000;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
      animation: slideDown 0.4s ease;
    `;
    
    prompt.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <div style="font-size: 24px; margin-right: 12px;">🔒</div>
        <div>
          <div style="color: #10B981; font-weight: 700; font-size: 16px;">
            Save Password to Lockdown?
          </div>
          <div style="color: #999; font-size: 13px;">
            We detected a new password for ${this.domain}
          </div>
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button id="page-save-yes" style="
          flex: 1;
          padding: 12px 20px;
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Save Password
        </button>
        <button id="page-save-later" style="
          padding: 12px 16px;
          background: transparent;
          color: #999;
          border: 1px solid #444;
          border-radius: 10px;
          font-size: 14px;
          cursor: pointer;
        ">
          Not Now
        </button>
      </div>
    `;
    
    // Add animation styles
    if (!document.getElementById('lockdown-page-animations')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-page-animations';
      styles.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    document.body.appendChild(prompt);
    
    // Event listeners
    prompt.querySelector('#page-save-yes').addEventListener('click', async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_CREDENTIAL',
          credential: formData
        });
        
        if (response.success) {
          this.showNotification('Password saved to Lockdown!', 'success');
          await this.loadCredentials();
        } else {
          this.showNotification('Failed to save password', 'error');
        }
      } catch (error) {
        this.showNotification('Failed to save password', 'error');
      }
      
      prompt.remove();
    });
    
    prompt.querySelector('#page-save-later').addEventListener('click', () => {
      prompt.remove();
    });
    
    // Auto-hide after 15 seconds
    setTimeout(() => {
      if (prompt.parentElement) {
        prompt.remove();
      }
    }, 15000);
  }

  generateFieldId(field) {
    return field.id || field.name || `field-${Array.from(document.querySelectorAll('input')).indexOf(field)}`;
  }

  createModal(title, content) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border-radius: 16px;
        padding: 24px;
        max-width: 320px;
        width: 90%;
        border: 1px solid #444;
      ">
        <h3 style="color: white; margin-bottom: 16px; font-size: 18px;">${title}</h3>
        ${content}
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
    
    return modal;
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
    `;
    
    switch (type) {
      case 'success':
        notification.style.background = '#10B981';
        break;
      case 'error':
        notification.style.background = '#EF4444';
        break;
      case 'info':
        notification.style.background = '#3B82F6';
        break;
    }
    
    notification.textContent = message;
    
    if (!document.querySelector('#lockdown-notification-styles')) {
      const styles = document.createElement('style');
      styles.id = 'lockdown-notification-styles';
      styles.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PasswordAssistant();
  });
} else {
  new PasswordAssistant();
}