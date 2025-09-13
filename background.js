// background.js - Enhanced background script with FIXED Argon2id WASM loading

class LockdownBackground {
  constructor() {
    this.vault = null;
    this.isUnlocked = false;
    this.masterPassword = null;
    this.autoLockTimer = null;
    this.autoLockDelay = 5 * 60 * 1000; // 5 minutes default
    this.unlockTime = null;
    this.argon2Loaded = false;
    
    // Argon2id parameters - optimized for browser extension use
    this.argon2Params = {
      time: 2,          // 2 iterations (faster for UX)
      mem: 32 * 1024,   // 32 MB memory usage (browser-friendly)
      hashLen: 32,      // 32 byte output
      parallelism: 1,   // 1 thread (service workers have limited threading)
      type: 2,          // Argon2id
      salt: null        // Will be generated per encryption
    };
    
    this.init();
  }

  async init() {
    console.log('Lockdown background initializing with REAL Argon2id...');
    
    // Load Argon2 library
    await this.loadArgon2Library();
    
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

    console.log('Lockdown background ready with Argon2id security');
  }

  async loadArgon2Library() {
    try {
      console.log('Loading Argon2 library...');
      
      // Import the Argon2 library
      if (typeof importScripts !== 'undefined') {
        importScripts('lib/argon2.js');
        console.log('Argon2 JavaScript library loaded');
        
        // Configure WASM path for extension context
        if (typeof argon2 !== 'undefined') {
          // Set the correct WASM path for Chrome extension
          const wasmPath = chrome.runtime.getURL('lib/argon2.wasm');
          const simdWasmPath = chrome.runtime.getURL('lib/argon2-simd.wasm');
          
          console.log('WASM Path:', wasmPath);
          console.log('SIMD WASM Path:', simdWasmPath);
          
          // Initialize Argon2 with correct WASM paths
          await this.initializeArgon2WithWasm(wasmPath, simdWasmPath);
          
        } else {
          throw new Error('Argon2 object not available after import');
        }
      } else {
        throw new Error('importScripts not available');
      }
    } catch (error) {
      console.error('Failed to load Argon2 library:', error);
      console.warn('Falling back to enhanced PBKDF2');
      this.argon2Loaded = false;
    }
  }

  async initializeArgon2WithWasm(wasmPath, simdWasmPath) {
    try {
      console.log('Initializing Argon2 with WASM...');
      
      // Fetch WASM file as ArrayBuffer
      const wasmResponse = await fetch(wasmPath);
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
      }
      
      const wasmArrayBuffer = await wasmResponse.arrayBuffer();
      console.log('WASM file loaded, size:', wasmArrayBuffer.byteLength);
      
      // Initialize Argon2 with the WASM binary
      if (typeof argon2.loadWASM === 'function') {
        await argon2.loadWASM(wasmArrayBuffer);
        console.log('✅ Argon2 WASM initialized successfully');
      } else if (typeof argon2.initialize === 'function') {
        await argon2.initialize({
          wasmBinary: wasmArrayBuffer
        });
        console.log('✅ Argon2 initialized with custom WASM');
      } else {
        // Fallback: Try to initialize with global WASM
        console.log('Using automatic WASM initialization...');
      }
      
      this.argon2Loaded = true;
      
      // Test the implementation
      await this.testArgon2Implementation();
      
    } catch (error) {
      console.error('WASM initialization failed:', error);
      
      // Try fallback method
      await this.tryFallbackArgon2Initialization();
    }
  }

  async tryFallbackArgon2Initialization() {
    try {
      console.log('Trying fallback Argon2 initialization...');
      
      // Sometimes argon2 auto-initializes, just test it
      this.argon2Loaded = true;
      await this.testArgon2Implementation();
      
      console.log('✅ Fallback Argon2 initialization successful');
    } catch (error) {
      console.error('Fallback initialization also failed:', error);
      this.argon2Loaded = false;
      throw error;
    }
  }

  async testArgon2Implementation() {
    if (!this.argon2Loaded || typeof argon2 === 'undefined') {
      throw new Error('Argon2 library not available');
    }

    console.log('Testing Argon2id implementation...');
    
    const testPassword = 'test_password_123';
    const testSalt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 
                                     17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
    
    try {
      console.time('Argon2id Performance Test');
      
      // Try different calling patterns based on the library version
      let result;
      
      if (typeof argon2.hash === 'function') {
        result = await argon2.hash({
          pass: testPassword,
          salt: testSalt,
          time: 1,
          mem: 1024, // 1MB for quick test
          parallelism: 1,
          type: argon2.ArgonType ? argon2.ArgonType.Argon2id : 2, // 2 = Argon2id
          hashLen: 32
        });
      } else if (typeof argon2.argon2id === 'function') {
        result = await argon2.argon2id({
          password: testPassword,
          salt: testSalt,
          time: 1,
          mem: 1024,
          parallelism: 1,
          hashLen: 32
        });
      } else {
        throw new Error('No suitable Argon2 hash function found');
      }
      
      console.timeEnd('Argon2id Performance Test');
      
      if (result && (result.hash || result.hashBytes)) {
        const hash = result.hash || result.hashBytes;
        console.log('✅ Argon2id working! Hash length:', hash.length);
        console.log('First 8 bytes:', Array.from(hash.slice(0, 8)));
        return { success: true, implementation: 'argon2id' };
      } else {
        throw new Error('Invalid result from Argon2 hash');
      }
      
    } catch (error) {
      console.error('❌ Argon2id test failed:', error);
      this.argon2Loaded = false;
      throw error;
    }
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
      
      case 'GET_SECURITY_STATUS':
        return this.getSecurityStatus();
      
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
        version: '2.0',
        security: this.argon2Loaded ? 'argon2id' : 'enhanced-pbkdf2'
      };

      console.log(`Creating vault with ${vaultData.security} encryption...`);

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

      console.log(`✅ Vault created successfully with ${vaultData.security}`);
      return { success: true, security: vaultData.security };
    } catch (error) {
      console.error('Vault setup failed:', error);
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

      console.log('Unlocking vault...');
      console.log('Vault KDF:', result.vault.kdf || 'legacy');

      // Decrypt vault with backward compatibility
      const vaultData = await this.decryptVault(result.vault, masterPassword);
      
      this.vault = vaultData;
      this.masterPassword = masterPassword;
      this.isUnlocked = true;
      this.startAutoLockTimer();

      // Notify all content scripts that vault is unlocked
      this.notifyContentScripts('VAULT_UNLOCKED');

      console.log('✅ Vault unlocked successfully');
      return { success: true, vault: vaultData };
    } catch (error) {
      console.error('Unlock failed:', error);
      return { error: 'Invalid password' };
    }
  }

  // Enhanced encryption with REAL Argon2id
  async encryptData(data, password) {
    if (this.argon2Loaded) {
      return await this.encryptDataWithArgon2(data, password);
    } else {
      console.warn('⚠️  Using enhanced PBKDF2 fallback');
      return await this.encryptDataWithEnhancedPBKDF2(data, password);
    }
  }

  async encryptDataWithArgon2(data, password) {
    const startTime = performance.now();
    
    try {
      const encoder = new TextEncoder();
      const dataString = JSON.stringify(data);
      
      // Generate random salt for Argon2
      const salt = crypto.getRandomValues(new Uint8Array(32));
      
      console.log('🔐 Deriving key with Argon2id...');
      console.time('Argon2id Key Derivation');
      
      // Use REAL Argon2id with flexible calling pattern
      let result;
      
      if (typeof argon2.hash === 'function') {
        result = await argon2.hash({
          pass: password,
          salt: salt,
          time: this.argon2Params.time,
          mem: this.argon2Params.mem,
          parallelism: this.argon2Params.parallelism,
          type: argon2.ArgonType ? argon2.ArgonType.Argon2id : 2,
          hashLen: this.argon2Params.hashLen
        });
      } else if (typeof argon2.argon2id === 'function') {
        result = await argon2.argon2id({
          password: password,
          salt: salt,
          time: this.argon2Params.time,
          mem: this.argon2Params.mem,
          parallelism: this.argon2Params.parallelism,
          hashLen: this.argon2Params.hashLen
        });
      } else {
        throw new Error('No suitable Argon2 function available');
      }
      
      console.timeEnd('Argon2id Key Derivation');
      
      const argon2Key = new Uint8Array(result.hash || result.hashBytes);
      
      // Generate IV for AES-GCM
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Import the derived key for AES-GCM
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        argon2Key,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );
      
      console.log('🔒 Encrypting data with AES-GCM...');
      
      // Encrypt the data
      const dataBuffer = encoder.encode(dataString);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        cryptoKey,
        dataBuffer
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`✅ Encryption completed in ${totalTime.toFixed(2)}ms`);

      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        salt: Array.from(salt),
        iv: Array.from(iv),
        version: '2.0',
        kdf: 'argon2id',
        kdfParams: {
          time: this.argon2Params.time,
          memory: this.argon2Params.mem,
          parallelism: this.argon2Params.parallelism,
          hashLen: this.argon2Params.hashLen
        },
        encryptionTime: totalTime
      };
    } catch (error) {
      console.error('❌ Argon2id encryption failed:', error);
      // Fallback to enhanced PBKDF2
      console.warn('Falling back to enhanced PBKDF2...');
      return await this.encryptDataWithEnhancedPBKDF2(data, password);
    }
  }

  async encryptDataWithEnhancedPBKDF2(data, password) {
    console.log('🔐 Using enhanced PBKDF2 encryption...');
    
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data);
    
    // Generate key material from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const salt = crypto.getRandomValues(new Uint8Array(32));
    
    // Use higher iterations for enhanced security
    const iterations = 250000; // Increased from 100000
    
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dataBuffer = encoder.encode(dataString);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      salt: Array.from(salt),
      iv: Array.from(iv),
      version: '2.0',
      kdf: 'enhanced-pbkdf2',
      kdfParams: {
        iterations: iterations
      }
    };
  }

  // Decrypt vault with backward compatibility
  async decryptVault(encryptedObj, password) {
    console.log(`🔓 Decrypting vault (KDF: ${encryptedObj.kdf || 'legacy'})...`);
    
    if (encryptedObj.kdf === 'argon2id') {
      return await this.decryptDataWithArgon2(encryptedObj, password);
    } else if (encryptedObj.kdf === 'enhanced-pbkdf2') {
      return await this.decryptDataWithEnhancedPBKDF2(encryptedObj, password);
    } else {
      // Legacy PBKDF2 decryption
      console.log('📦 Decrypting legacy PBKDF2 vault...');
      const decrypted = await this.decryptDataLegacy(encryptedObj, password);
      console.log('⬆️  Vault will be upgraded to Argon2id on next save');
      return decrypted;
    }
  }

  async decryptDataWithArgon2(encryptedObj, password) {
    if (!this.argon2Loaded) {
      throw new Error('Argon2 library not available for decryption');
    }

    try {
      const decoder = new TextDecoder();
      const salt = new Uint8Array(encryptedObj.salt);
      const params = encryptedObj.kdfParams;
      
      console.time('Argon2id Decryption');
      
      // Derive key using stored parameters with flexible calling pattern
      let result;
      
      if (typeof argon2.hash === 'function') {
        result = await argon2.hash({
          pass: password,
          salt: salt,
          time: params.time,
          mem: params.memory,
          parallelism: params.parallelism,
          type: argon2.ArgonType ? argon2.ArgonType.Argon2id : 2,
          hashLen: params.hashLen
        });
      } else if (typeof argon2.argon2id === 'function') {
        result = await argon2.argon2id({
          password: password,
          salt: salt,
          time: params.time,
          mem: params.memory,
          parallelism: params.parallelism,
          hashLen: params.hashLen
        });
      } else {
        throw new Error('No suitable Argon2 function available for decryption');
      }
      
      console.timeEnd('Argon2id Decryption');
      
      const argon2Key = new Uint8Array(result.hash || result.hashBytes);
      
      // Import the derived key
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        argon2Key,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      // Decrypt the data
      const decrypted = await crypto.subtle.decrypt(
        { 
          name: 'AES-GCM', 
          iv: new Uint8Array(encryptedObj.iv) 
        },
        cryptoKey,
        new Uint8Array(encryptedObj.encrypted)
      );

      const decryptedString = decoder.decode(decrypted);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Argon2id decryption failed:', error);
      throw new Error('Decryption failed: Invalid password or corrupted data');
    }
  }

  async decryptDataWithEnhancedPBKDF2(encryptedObj, password) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const params = encryptedObj.kdfParams;
    
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
        iterations: params.iterations,
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

  // Legacy PBKDF2 decryption for backward compatibility
  async decryptDataLegacy(encryptedObj, password) {
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
        iterations: 100000, // Original iteration count
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

      // Save vault (will use best available encryption)
      const encrypted = await this.encryptData(this.vault, this.masterPassword);
      await chrome.storage.local.set({ vault: encrypted });

      const securityMethod = encrypted.kdf || 'legacy';
      console.log(`✅ Credential saved with ${securityMethod} encryption:`, credential.name || credential.domain);
      
      return { success: true, credential, security: securityMethod };
    } catch (error) {
      console.error('Save credential error:', error);
      return { error: error.message };
    }
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

      // Save vault with current best encryption
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

      // Save vault with current best encryption
      const encrypted = await this.encryptData(this.vault, this.masterPassword);
      await chrome.storage.local.set({ vault: encrypted });

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  getSecurityStatus() {
    return {
      argon2Available: this.argon2Loaded,
      currentSecurity: this.argon2Loaded ? 'argon2id' : 'enhanced-pbkdf2',
      isUnlocked: this.isUnlocked,
      hasVault: this.vault !== null,
      credentialCount: this.vault ? this.vault.credentials.length : 0
    };
  }

  getStatus() {
    return {
      isUnlocked: this.isUnlocked,
      hasVault: this.vault !== null,
      unlockTime: this.unlockTime,
      autoLockDelay: this.autoLockDelay,
      credentialCount: this.vault ? this.vault.credentials.length : 0,
      securityLevel: this.argon2Loaded ? 'argon2id' : 'enhanced-pbkdf2',
      argon2Available: this.argon2Loaded
    };
  }

  // Rest of methods remain the same...
  lockVault() {
    this.vault = null;
    this.masterPassword = null;
    this.isUnlocked = false;
    this.unlockTime = null;
    
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    this.notifyContentScripts('VAULT_LOCKED');
    return { success: true };
  }

  getCredentials(domain) {
    if (!this.isUnlocked || !this.vault) {
      return { credentials: [] };
    }

    const credentials = this.vault.credentials.filter(cred => {
      return cred.domain === domain || 
             (cred.url && cred.url.includes(domain)) ||
             (cred.name && cred.name.toLowerCase().includes(domain.toLowerCase()));
    });

    credentials.sort((a, b) => (b.modified || b.created) - (a.modified || a.created));
    return { credentials };
  }

  getAllCredentials() {
    if (!this.isUnlocked || !this.vault) {
      return { credentials: [] };
    }

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

  generatePassword(length = 32, includeSymbols = true) {
    let charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    if (includeSymbols) {
      charset += '!@#$%^&*';
    }
    
    let password = '';
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
    
    const remainingLength = length - password.length;
    for (let i = 0; i < remainingLength; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    password = password.split('').sort(() => Math.random() - 0.5).join('');
    return { password };
  }

  async updateAutoLock(delay) {
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
      return;
    }

    this.unlockTime = Date.now();
    this.autoLockTimer = setTimeout(() => {
      this.lockVault();
    }, this.autoLockDelay);
  }

  async openPopup() {
    try {
      await chrome.action.openPopup();
      return { success: true };
    } catch (error) {
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
}

// Initialize
const lockdownBackground = new LockdownBackground();
