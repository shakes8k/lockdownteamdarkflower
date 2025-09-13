// background.js - Enhanced background script for Lockdown extension with Password Assistant support

class LockdownBackground {
  constructor() {
    this.vault = null;
    this.isUnlocked = false;
    this.masterPassword = null;
    this.autoLockTimer = null;
    this.autoLockDelay = 5 * 60 * 1000; // 5 minutes default
    this.unlockTime = null;
    
    this.init();
  }

  async init() {
    console.log('Lockdown background initializing...');
    
    // Load settings
    await this.loadSettings();
    
    // Set up message listeners
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message).then(response => {
        sendResponse(response);
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true; // Keep channel open for async response
    });

    console.log('Lockdown background ready');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['autoLockDelay']);
      this.autoLockDelay = result.autoLockDelay || (5 * 60 * 1000);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'SETUP_VAULT':
        return await this.setupVault(message.masterPassword);
      
      case 'UNLOCK_VAULT':
        return await this.unlockVault(message.masterPassword);
      
      case 'LOCK_VAULT':
        return this.lockVault();
      
      case 'GET_STATUS':
        return this.getStatus();
      
      case 'SAVE_CREDENTIAL':
        return await this.saveCredential(message.credential);
      
      case 'GET_CREDENTIALS':
        return this.getCredentials(message.domain);
      
      case 'DELETE_CREDENTIAL':
        return await this.deleteCredential(message.credentialId);
      
      case 'UPDATE_CREDENTIAL':
        return await this.updateCredential(message.credential);
      
      case 'GENERATE_PASSWORD':
        return this.generatePassword(message.length || 32, message.symbols !== false);
      
      case 'UPDATE_AUTO_LOCK':
        return await this.updateAutoLock(message.delay);
      
      case 'GET_REMAINING_TIME':
        return this.getRemainingTime();
      
      case 'OPEN_POPUP':
        return await this.openPopup();
        
      case 'GET_ALL_CREDENTIALS':
        return this.getAllCredentials();
        
      case 'SEARCH_CREDENTIALS':
        return this.searchCredentials(message.query);
      
      default:
        throw new Error('Unknown message type: ' + message.type);
    }
  }

  async setupVault(masterPassword) {
    try {
      // Create new empty vault
      const vaultData = {
        credentials: [],
        created: Date.now(),
        version: '1.1'
      };

      // Encrypt and save
      const encrypted = await this.encryptData(vaultData, masterPassword);
      await chrome.storage.local.set({ 
        vault: encrypted,
        setupCompleted: true 
      });

      // Unlock the vault
      this.vault = vaultData;
      this.masterPassword = masterPassword;
      this.isUnlocked = true;
      this.startAutoLockTimer();

      // Notify all content scripts that vault is unlocked
      this.notifyContentScripts('VAULT_UNLOCKED');

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  async unlockVault(masterPassword) {
    try {
      // Get encrypted vault
      const result = await chrome.storage.local.get(['vault']);
      if (!result.vault) {
        return { error: 'No vault found' };
      }

      // Decrypt vault
      const vaultData = await this.decryptData(result.vault, masterPassword);
      
      this.vault = vaultData;
      this.masterPassword = masterPassword;
      this.isUnlocked = true;
      this.startAutoLockTimer();

      // Notify all content scripts that vault is unlocked
      this.notifyContentScripts('VAULT_UNLOCKED');

      return { success: true, vault: vaultData };
    } catch (error) {
      return { error: 'Invalid password' };
    }
  }

  lockVault() {
    this.vault = null;
    this.masterPassword = null;
    this.isUnlocked = false;
    this.unlockTime = null;
    
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    // Notify all content scripts that vault is locked
    this.notifyContentScripts('VAULT_LOCKED');

    return { success: true };
  }

  getStatus() {
    return {
      isUnlocked: this.isUnlocked,
      hasVault: this.vault !== null,
      unlockTime: this.unlockTime,
      autoLockDelay: this.autoLockDelay,
      credentialCount: this.vault ? this.vault.credentials.length : 0
    };
  }

  async saveCredential(credential) {
    if (!this.isUnlocked || !this.vault) {
      return { error: 'Vault is locked' };
    }

    try {
      // Generate ID and timestamps
      credential.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      credential.created = Date.now();
      credential.modified = Date.now();
      
      // Add domain if not present
      if (!credential.domain && credential.url) {
        try {
          credential.domain = new URL(credential.url).hostname;
        } catch (e) {
          // If URL parsing fails, use provided domain or current tab
        }
      }
      
      this.vault.credentials.push(credential);

      // Save vault
      const encrypted = await this.encryptData(this.vault, this.masterPassword);
      await chrome.storage.local.set({ vault: encrypted });

      console.log('Credential saved:', credential.name || credential.domain);
      return { success: true, credential };
    } catch (error) {
      console.error('Save credential error:', error);
      return { error: error.message };
    }
  }

  getCredentials(domain) {
    if (!this.isUnlocked || !this.vault) {
      return { credentials: [] };
    }

    const credentials = this.vault.credentials.filter(cred => {
      // Match exact domain or if URL contains domain
      return cred.domain === domain || 
             (cred.url && cred.url.includes(domain)) ||
             (cred.name && cred.name.toLowerCase().includes(domain.toLowerCase()));
    });

    // Sort by most recently used/created
    credentials.sort((a, b) => (b.modified || b.created) - (a.modified || a.created));

    return { credentials };
  }

  getAllCredentials() {
    if (!this.isUnlocked || !this.vault) {
      return { credentials: [] };
    }

    // Return all credentials sorted by most recently modified
    const credentials = [...this.vault.credentials];
    credentials.sort((a, b) => (b.modified || b.created) - (a.modified || a.created));
    
    return { credentials };
  }

  searchCredentials(query) {
    if (!this.isUnlocked || !this.vault || !query) {
      return { credentials: [] };
    }

    const searchTerm = query.toLowerCase();
    const credentials = this.vault.credentials.filter(cred => {
      return (cred.name && cred.name.toLowerCase().includes(searchTerm)) ||
             (cred.domain && cred.domain.toLowerCase().includes(searchTerm)) ||
             (cred.username && cred.username.toLowerCase().includes(searchTerm)) ||
             (cred.email && cred.email.toLowerCase().includes(searchTerm));
    });

    credentials.sort((a, b) => (b.modified || b.created) - (a.modified || a.created));
    return { credentials };
  }

  async deleteCredential(credentialId) {
    if (!this.isUnlocked || !this.vault) {
      return { error: 'Vault is locked' };
    }

    try {
      const index = this.vault.credentials.findIndex(cred => cred.id === credentialId);
      if (index === -1) {
        return { error: 'Credential not found' };
      }

      this.vault.credentials.splice(index, 1);

      // Save vault
      const encrypted = await this.encryptData(this.vault, this.masterPassword);
      await chrome.storage.local.set({ vault: encrypted });

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  async updateCredential(credential) {
    if (!this.isUnlocked || !this.vault) {
      return { error: 'Vault is locked' };
    }

    try {
      const index = this.vault.credentials.findIndex(cred => cred.id === credential.id);
      if (index === -1) {
        return { error: 'Credential not found' };
      }

      credential.modified = Date.now();
      this.vault.credentials[index] = credential;

      // Save vault
      const encrypted = await this.encryptData(this.vault, this.masterPassword);
      await chrome.storage.local.set({ vault: encrypted });

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  generatePassword(length = 32, includeSymbols = true) {
    let charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    if (includeSymbols) {
      charset += '!@#$%^&*';
    }
    
    let password = '';
    
    // Ensure at least one character from each required set
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    
    if (includeSymbols) {
      const symbols = '!@#$%^&*';
      password += symbols.charAt(Math.floor(Math.random() * symbols.length));
    }
    
    // Fill the rest randomly
    const remainingLength = length - password.length;
    for (let i = 0; i < remainingLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Shuffle the password
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    return { password };
  }

  async updateAutoLock(delay) {
    console.log('Updating auto-lock delay to:', delay);
    
    if (delay === 'never') {
      this.autoLockDelay = null;
    } else {
      this.autoLockDelay = parseInt(delay);
    }
    
    await chrome.storage.local.set({ autoLockDelay: this.autoLockDelay });

    if (this.isUnlocked) {
      this.startAutoLockTimer();
    }

    return { success: true };
  }

  getRemainingTime() {
    if (!this.isUnlocked || !this.unlockTime || !this.autoLockDelay) {
      return { remaining: null };
    }

    const elapsed = Date.now() - this.unlockTime;
    const remaining = Math.max(0, this.autoLockDelay - elapsed);

    const totalSeconds = Math.floor(remaining / 1000);
    const remainingMinutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    return {
      remaining,
      remainingMinutes,
      remainingSeconds,
      totalSeconds
    };
  }

  startAutoLockTimer() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    if (!this.autoLockDelay) {
      console.log('Auto-lock disabled, not starting timer');
      return;
    }

    this.unlockTime = Date.now();
    
    console.log(`Starting auto-lock timer for ${this.autoLockDelay}ms`);
    
    this.autoLockTimer = setTimeout(() => {
      console.log('Auto-locking vault');
      this.lockVault();
    }, this.autoLockDelay);
  }

  async openPopup() {
    try {
      // This will open the extension popup
      await chrome.action.openPopup();
      return { success: true };
    } catch (error) {
      // Fallback: open in a new tab if popup fails
      await chrome.tabs.create({
        url: chrome.runtime.getURL('popup.html'),
        active: true
      });
      return { success: true };
    }
  }

  async notifyContentScripts(message) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: message });
        } catch (error) {
          // Ignore errors for tabs that don't have content scripts
        }
      }
    } catch (error) {
      console.error('Failed to notify content scripts:', error);
    }
  }

  // Enhanced encryption with better security
  async encryptData(data, password) {
    const encoder = new TextEncoder();
    
    // Generate key material from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = encoder.encode(JSON.stringify(data));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      salt: Array.from(salt),
      iv: Array.from(iv),
      version: '1.1'
    };
  }

  async decryptData(encryptedObj, password) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(encryptedObj.salt),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { 
        name: 'AES-GCM', 
        iv: new Uint8Array(encryptedObj.iv) 
      },
      key,
      new Uint8Array(encryptedObj.encrypted)
    );

    const decryptedString = decoder.decode(decrypted);
    return JSON.parse(decryptedString);
  }
}

// Initialize
const lockdownBackground = new LockdownBackground();