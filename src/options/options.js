// DOM Elements (Grouped for clarity)
const Elements = {
    // General Settings
    autoOptimize: document.getElementById('autoOptimize'),
    optimizeDelay: document.getElementById('optimizeDelay'),
    maxLength: document.getElementById('maxLength'),
    temperature: document.getElementById('temperature'),
    temperatureValue: document.getElementById('temperatureValue'),
    promptTemplate: document.getElementById('promptTemplate'),
    // Interface Settings
    showButton: document.getElementById('showButton'),
    buttonPosition: document.getElementById('buttonPosition'),
    showDebugInfo: document.getElementById('showDebugInfo'),
    // Grok API Settings
    grokUrl: document.getElementById('grok-url'),
    grokKey: document.getElementById('grok-key'),
    grokModel: document.getElementById('grok-model'),
    testGrokButton: document.getElementById('test-grok'),
    toggleGrokKey: document.getElementById('toggle-grok-key'),
    refreshModelsButton: null, // Will be created
    // Debug Tools
    checkPermissionsButton: document.getElementById('check-permissions'),
    checkApiConfigButton: document.getElementById('check-api-config'),
    testFetchButton: document.getElementById('test-fetch'),
    debugOutputDiv: document.getElementById('debug-output'),
    // Status Elements
    saveButton: document.getElementById('save'),
    statusElement: document.getElementById('status'),
    testResultElement: document.getElementById('test-result'),
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    sections: document.querySelectorAll('.section')
};

// Constants
const MODEL_NAME_GROK = 'grok'; // Consistent model name
const DEFAULT_GROK_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_GROK_MODEL = 'grok-3-beta';
const STORAGE_KEYS = { // Match background script
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    CURRENT_MODEL: 'currentModel',
    MODEL_VARIANT: 'modelVariant',
};

// Default Settings Structure (Mirror background if possible)
const DEFAULT_SETTINGS = {
    autoOptimize: false,
    optimizeDelay: 1000,
    maxLength: 1500,
    temperature: 0.7,
    promptTemplate: '{text}，请用更专业的语言重新组织这段文字，使其更清晰、更有说服力，同时保持原意。',
    showButton: true,
    buttonPosition: 'right',
    showDebugInfo: false,
    apiConfig: {
        [MODEL_NAME_GROK]: {
            url: DEFAULT_GROK_URL,
            // Model variant stored separately
        }
    }
};


// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Options page loaded.');
    initTabs();
    createRefreshButton(); // Create the button dynamically

    try {
        const { settings: storedSettings, apiKeys = {}, modelVariant } = await chrome.storage.sync.get([
            STORAGE_KEYS.SETTINGS,
            STORAGE_KEYS.API_KEYS,
            STORAGE_KEYS.MODEL_VARIANT
        ]);

        // Deep merge settings carefully to handle nested objects like apiConfig
        const mergedSettings = mergeDeep(DEFAULT_SETTINGS, storedSettings || {});
        // Ensure apiConfig structure exists
        mergedSettings.apiConfig = mergedSettings.apiConfig || {};
        mergedSettings.apiConfig[MODEL_NAME_GROK] = mergedSettings.apiConfig[MODEL_NAME_GROK] || DEFAULT_SETTINGS.apiConfig[MODEL_NAME_GROK];


        // Fetch models first, then update UI which depends on the model list
        await fetchXAIModels(false, mergedSettings.apiConfig[MODEL_NAME_GROK].model || modelVariant); // Pass current model for selection
        updateUI(mergedSettings, apiKeys, modelVariant);
        setupEventListeners();

    } catch (error) {
        console.error("Initialization error:", error);
        showStatus(`页面初始化失败: ${error.message}`, 'error');
        // Optionally update UI with default values on error
        updateUI(DEFAULT_SETTINGS, {});
         setupEventListeners(); // Still setup listeners maybe?
    }
});

// Simple deep merge utility (can be replaced with lodash.merge if preferred)
function mergeDeep(target, source) {
    const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = mergeDeep(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

// --- UI Initialization & Updates ---

function initTabs() {
    Elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            Elements.tabs.forEach(t => t.classList.remove('active'));
            Elements.sections.forEach(s => s.style.display = 'none');
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            const section = document.getElementById(tabId);
            if(section) section.style.display = 'block';
        });
    });
     // Activate the first tab initially
     if (Elements.tabs.length > 0) {
         Elements.tabs[0].click();
     }
}

function createRefreshButton() {
    Elements.refreshModelsButton = document.createElement('button');
    Elements.refreshModelsButton.id = 'refresh-models';
    Elements.refreshModelsButton.className = 'button secondary-button test-button'; // Reuse existing style
    Elements.refreshModelsButton.textContent = '刷新列表';
    Elements.refreshModelsButton.style.marginLeft = '8px'; // Add some spacing
    // Insert after the model select dropdown
     if (Elements.grokModel && Elements.grokModel.parentNode) {
          // Insert after the paragraph containing the help text for model select
          const helpTextParagraph = Elements.grokModel.closest('.option-group')?.querySelector('.help-text');
          if (helpTextParagraph) {
              helpTextParagraph.parentNode.insertBefore(Elements.refreshModelsButton, helpTextParagraph.nextSibling);
          } else {
               // Fallback: append after the select element itself
               Elements.grokModel.parentNode.insertBefore(Elements.refreshModelsButton, Elements.grokModel.nextSibling);
          }
     }
}

// Update UI elements based on loaded settings
function updateUI(settings, apiKeys = {}, modelVariant = null) {
    try {
        // Basic Settings
        Elements.autoOptimize.checked = settings.autoOptimize ?? false;
        Elements.optimizeDelay.value = settings.optimizeDelay ?? 1000;
        Elements.maxLength.value = settings.maxLength ?? 1500;
        Elements.temperature.value = settings.temperature ?? 0.7;
        Elements.temperatureValue.textContent = Elements.temperature.value;
        Elements.promptTemplate.value = settings.promptTemplate || DEFAULT_SETTINGS.promptTemplate;

        // Interface Settings
        Elements.showButton.checked = settings.showButton ?? true;
        Elements.buttonPosition.value = settings.buttonPosition || 'right';
        Elements.showDebugInfo.checked = settings.showDebugInfo ?? false;

        // API Config - Grok specific
        const grokConfig = settings.apiConfig?.[MODEL_NAME_GROK] || {};
        Elements.grokUrl.value = grokConfig.url || DEFAULT_GROK_URL;
        Elements.grokKey.value = apiKeys[MODEL_NAME_GROK] || '';

        // Model Variant Selection (ensure the dropdown is populated first by fetchXAIModels)
        const effectiveModelVariant = modelVariant || settings.apiConfig?.[MODEL_NAME_GROK]?.model || DEFAULT_GROK_MODEL; // Use stored variant or default
         console.log("Setting model dropdown to:", effectiveModelVariant);
         // Check if the option exists before setting
         if (Array.from(Elements.grokModel.options).some(opt => opt.value === effectiveModelVariant)) {
             Elements.grokModel.value = effectiveModelVariant;
         } else {
             console.warn(`Saved model variant "${effectiveModelVariant}" not found in dropdown. Adding it.`);
             // Add the option if it's missing (e.g., manually entered non-standard model)
              const option = document.createElement('option');
              option.value = effectiveModelVariant;
              option.textContent = `${effectiveModelVariant} (Saved)`;
              Elements.grokModel.appendChild(option);
              Elements.grokModel.value = effectiveModelVariant;
         }

    } catch (error) {
        console.error("Error updating UI:", error);
        showStatus(`更新界面时出错: ${error.message}`, 'error');
    }
}


// --- Event Listeners Setup ---

function setupEventListeners() {
    // Real-time update for temperature slider
    Elements.temperature.addEventListener('input', (e) => {
        Elements.temperatureValue.textContent = e.target.value;
    });

    // Save Button
    Elements.saveButton.addEventListener('click', saveSettings);

    // Test Connection Button (Grok)
    if (Elements.testGrokButton) {
        Elements.testGrokButton.addEventListener('click', () => testApiConnection(MODEL_NAME_GROK));
    }

    // Toggle API Key Visibility
    if (Elements.toggleGrokKey) {
        Elements.toggleGrokKey.addEventListener('click', () => {
            const keyInput = Elements.grokKey;
            if (keyInput.type === 'password') {
                keyInput.type = 'text';
                Elements.toggleGrokKey.textContent = '🔒'; // Hide icon
            } else {
                keyInput.type = 'password';
                Elements.toggleGrokKey.textContent = '👁️'; // Show icon
            }
        });
    }

    // Refresh Models Button
    if (Elements.refreshModelsButton) {
        Elements.refreshModelsButton.addEventListener('click', handleRefreshModels);
    }

    // Debug Tools Buttons
    if (Elements.checkPermissionsButton) {
        Elements.checkPermissionsButton.addEventListener('click', checkPermissions);
    }
    if (Elements.checkApiConfigButton) {
        Elements.checkApiConfigButton.addEventListener('click', checkApiConfig);
    }
    if (Elements.testFetchButton) {
         // Note: testFetchAPI was a simple HEAD request test, less useful than full API test.
         // Consider removing or making it test the *configured* API URL.
        Elements.testFetchButton.addEventListener('click', () => testConfiguredApiUrl(Elements.grokUrl.value));
    }
}

// --- Core Logic Functions ---

// Validate settings before saving
function validateSettings(settings, apiKey) {
    if (isNaN(settings.optimizeDelay) || settings.optimizeDelay < 0) {
        return { valid: false, message: '自动优化延迟必须是非负数字。' };
    }
    if (isNaN(settings.maxLength) || settings.maxLength <= 5) { // Increased min length slightly
        return { valid: false, message: '最大输出长度必须是大于5的数字。' };
    }
    if (isNaN(settings.temperature) || settings.temperature < 0 || settings.temperature > 2) { // Allow higher temp? Check API docs. Max 1 usually safe.
        return { valid: false, message: '温度值必须在 0 到 1 (或API支持的最大值) 之间。' };
    }
    if (!settings.promptTemplate || !settings.promptTemplate.includes('{text}')) {
        return { valid: false, message: '提示词模板必须包含 {text} 占位符。' };
    }
    const grokUrl = settings.apiConfig?.[MODEL_NAME_GROK]?.url;
    if (grokUrl && !isValidUrl(grokUrl)) {
        return { valid: false, message: 'Grok API URL 格式无效。' };
    }
    // Note: API Key itself isn't validated here, only its presence if required (handled by test/save logic)
    return { valid: true };
}

function isValidUrl(string) {
    try {
        new URL(string);
        return string.startsWith('http://') || string.startsWith('https://');
    } catch (_) {
        return false;
    }
}

// Save settings to chrome.storage
async function saveSettings() {
    hideStatus(); // Clear previous status
    try {
        // Collect settings from UI elements
        const settingsToSave = {
            autoOptimize: Elements.autoOptimize.checked,
            optimizeDelay: parseInt(Elements.optimizeDelay.value, 10),
            maxLength: parseInt(Elements.maxLength.value, 10),
            temperature: parseFloat(Elements.temperature.value),
            promptTemplate: Elements.promptTemplate.value.trim(),
            showButton: Elements.showButton.checked,
            buttonPosition: Elements.buttonPosition.value,
            showDebugInfo: Elements.showDebugInfo.checked,
            apiConfig: {
                [MODEL_NAME_GROK]: {
                    url: Elements.grokUrl.value.trim(),
                    // Model variant is saved separately below
                }
            }
        };
        const apiKeyToSave = Elements.grokKey.value.trim();
        const modelVariantToSave = Elements.grokModel.value;

        // Validate collected settings
        const validation = validateSettings(settingsToSave, apiKeyToSave);
        if (!validation.valid) {
            showStatus(validation.message, 'error');
            return;
        }

        // Prepare data for storage
        const dataToStore = {
            [STORAGE_KEYS.SETTINGS]: settingsToSave,
            [STORAGE_KEYS.MODEL_VARIANT]: modelVariantToSave,
            // Only update API key if it's provided, otherwise keep existing one
             // If you want to allow *clearing* the key, handle empty string explicitly
        };

         // Handle API Key saving - only save if changed or non-empty
         const { apiKeys: currentApiKeys = {} } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEYS);
         if (apiKeyToSave !== (currentApiKeys[MODEL_NAME_GROK] || '')) {
              // Save the new key (even if empty, allowing removal)
              currentApiKeys[MODEL_NAME_GROK] = apiKeyToSave;
              dataToStore[STORAGE_KEYS.API_KEYS] = currentApiKeys;
         } else {
              // No change in API key, don't include it in the set call
         }


        // Save to storage
        await chrome.storage.sync.set(dataToStore);

        showStatus('设置已保存', 'success');
        console.log('Settings saved:', dataToStore);

        // Notify background script about the update to clear caches etc.
        chrome.runtime.sendMessage({ action: 'settingsUpdated' }, (response) => {
             if (chrome.runtime.lastError) {
                 console.warn('Failed to notify background script:', chrome.runtime.lastError.message);
             } else if (response?.success) {
                  console.log('Background script acknowledged settings update.');
             }
        });

    } catch (error) {
        console.error('Failed to save settings:', error);
        showStatus(`保存设置失败: ${error.message}`, 'error');
    }
}


// --- API Interaction (via Background Script) ---

async function testApiConnection(modelType) {
    // Always use background script for actual API calls
    showTestResult('正在发送测试请求...', 'info');
    const apiKey = Elements.grokKey.value.trim(); // Get current key from input
    const modelName = Elements.grokModel.value;   // Get current model from input

    // Basic checks before sending message
    if (!apiKey) {
        showTestResult('请输入API密钥后再测试。', 'error');
        return;
    }
     if (!modelName) {
          showTestResult('请选择一个模型版本。', 'error');
          return;
     }

    try {
        const result = await chrome.runtime.sendMessage({
            action: 'testApiConnection',
            model: modelType,
            modelName: modelName, // Send the selected model variant
            text: '这是一个从选项页面发起的API连接测试。' // More specific test text
        });

        console.log('Test connection result:', result);
        if (result && result.success) {
            showTestResult(`测试成功! 响应: ${result.message || '(无文本内容)'}`, 'success');
        } else {
            showTestResult(`测试失败: ${result.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        console.error('Error during test connection message:', error);
        showTestResult(`测试请求发送失败: ${error.message}`, 'error');
         if (error.message.includes('Extension context invalidated')) {
            showTestResult('扩展连接已断开，请刷新页面或重新启用扩展。', 'error');
         }
    }
}

async function handleRefreshModels() {
     Elements.refreshModelsButton.disabled = true;
     Elements.refreshModelsButton.textContent = '刷新中...';
     showStatus('正在刷新模型列表...', 'info');
     try {
          const currentModel = Elements.grokModel.value; // Remember currently selected
          await fetchXAIModels(true, currentModel); // Force refresh, pass current
          showStatus('模型列表已刷新。', 'success');
     } catch (error) {
          showStatus(`刷新模型列表失败: ${error.message}`, 'error');
     } finally {
          Elements.refreshModelsButton.disabled = false;
          Elements.refreshModelsButton.textContent = '刷新列表';
     }
}

// Fetch available models (Simulated - Replace with actual API call if available)
async function fetchXAIModels(forceRefresh = false, currentModelValue = null) {
     // ** SIMULATED FUNCTION **
     // Replace this with an actual fetch to an X.AI endpoint if one exists.
     // For now, it uses a hardcoded list and simulates based on API key presence.
     showDebugOutput('获取模型列表 (模拟)...');

     // Avoid unnecessary "fetching" if dropdown is populated and not forcing refresh
      if (!forceRefresh && Elements.grokModel.options.length > 1) { // Check for more than default/placeholder
          showDebugOutput('使用现有模型列表。');
          // Ensure current value is still selected if provided
          if(currentModelValue && Array.from(Elements.grokModel.options).some(opt => opt.value === currentModelValue)) {
              Elements.grokModel.value = currentModelValue;
          }
          return;
      }

      // Simulate network delay for refresh
      if (forceRefresh) {
           await new Promise(resolve => setTimeout(resolve, 500));
      }

      let models = [];
      try {
          const { apiKeys = {} } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEYS);
          const hasApiKey = !!apiKeys[MODEL_NAME_GROK];

          if (hasApiKey) {
              // Simulate more models if key exists
               models = [
                   { id: 'grok-3.5', name: 'grok-3.5 (最新)' },
                   { id: 'grok-3-beta', name: 'grok-3-beta' },
                   { id: 'grok-3-mini-beta', name: 'grok-3-mini-beta' },
                   { id: 'grok-3-mini-fast-beta', name: 'grok-3-mini-fast-beta' },
                   { id: 'grok-2', name: 'grok-2' },
                   { id: 'grok-1.5', name: 'grok-1.5' }
               ];
              showDebugOutput('模拟：检测到API密钥，获取完整模型列表。');
          } else {
              // Simulate fewer models if no key
              models = [
                   { id: 'grok-3-beta', name: 'grok-3-beta' },
                   { id: 'grok-3-mini-beta', name: 'grok-3-mini-beta' },
                   { id: 'grok-3-mini-fast-beta', name: 'grok-3-mini-fast-beta' }
               ];
              showDebugOutput('模拟：未检测到API密钥，获取基础模型列表。');
          }

          // Populate dropdown
          Elements.grokModel.innerHTML = ''; // Clear existing options
          models.forEach(model => {
              const option = document.createElement('option');
              option.value = model.id;
              option.textContent = model.name;
              Elements.grokModel.appendChild(option);
          });

           // Try to re-select the previously selected or saved model
           const modelToSelect = currentModelValue || DEFAULT_GROK_MODEL;
           if (Array.from(Elements.grokModel.options).some(opt => opt.value === modelToSelect)) {
               Elements.grokModel.value = modelToSelect;
           } else {
                // If the saved model is not in the new list, add it and select it
                 console.warn(`Previously selected model "${modelToSelect}" not in fetched list. Adding it.`);
                 const option = document.createElement('option');
                 option.value = modelToSelect;
                 option.textContent = `${modelToSelect} (Saved/Custom)`;
                 Elements.grokModel.appendChild(option);
                 Elements.grokModel.value = modelToSelect;
           }

          showDebugOutput('模型列表填充完成。');

      } catch (error) {
           console.error("Error during (simulated) model fetch:", error);
           showDebugOutput(`获取模型列表出错: ${error.message}`);
           // Optionally add a placeholder error option
            Elements.grokModel.innerHTML = '<option value="">无法加载模型</option>';
           throw error; // Re-throw for caller handling
      }
}


// --- Debugging Tools ---

async function checkPermissions() {
     showDebugOutput('检查权限...');
     try {
         const manifest = chrome.runtime.getManifest();
         const requiredPermissions = manifest.permissions || [];
         const requiredHostPermissions = manifest.host_permissions || [];

         let output = `Manifest Version: ${manifest.manifest_version}\n`;
         output += `\n请求的权限:\n- ${requiredPermissions.join('\n- ') || '无'}\n`;
         output += `\n请求的主机权限:\n- ${requiredHostPermissions.join('\n- ') || '无'}\n`;

         // Check granted permissions (Note: activeTab is granted on user gesture)
          output += "\n实际授予的权限 (可能不完全准确):\n";
         const hasStorage = await chrome.permissions.contains({ permissions: ['storage'] });
         output += `- storage: ${hasStorage ? '✅' : '❌'}\n`;
         const hasScripting = await chrome.permissions.contains({ permissions: ['scripting'] });
         output += `- scripting: ${hasScripting ? '✅' : '❌'}\n`;
         const hasTabs = await chrome.permissions.contains({ permissions: ['tabs'] });
         output += `- tabs: ${hasTabs ? '✅' : '❌'}\n`;

         output += "\n实际授予的主机权限:\n";
         let hasApiHost = false;
         for (const host of requiredHostPermissions) {
              const granted = await chrome.permissions.contains({ origins: [host] });
              output += `- ${host}: ${granted ? '✅' : '❌'}\n`;
              if (host.includes('api.x.ai') && granted) hasApiHost = true;
         }

         output += `\n摘要:\n`;
         output += `- 存储权限: ${hasStorage ? '✅' : '❌ (必需)'}\n`;
         output += `- Grok API主机权限 (${requiredHostPermissions.find(h => h.includes('api.x.ai')) || '未请求'}): ${hasApiHost ? '✅' : '❌ (必需)'}\n`;

         showDebugOutput(output);

     } catch (error) {
         console.error("Error checking permissions:", error);
         showDebugOutput(`检查权限时出错: ${error.message}`);
     }
}

async function checkApiConfig() {
     showDebugOutput('检查当前配置...');
     try {
         const { settings = {}, apiKeys = {}, modelVariant } = await chrome.storage.sync.get([
             STORAGE_KEYS.SETTINGS, STORAGE_KEYS.API_KEYS, STORAGE_KEYS.MODEL_VARIANT
         ]);
         const mergedSettings = mergeDeep(DEFAULT_SETTINGS, settings);

         const grokConfig = mergedSettings.apiConfig?.[MODEL_NAME_GROK] || {};
         const grokKey = apiKeys[MODEL_NAME_GROK] || '';
         const currentModelVariant = modelVariant || grokConfig.model || DEFAULT_GROK_MODEL;

         let output = `Grok 配置:\n`;
         output += `- API URL: ${grokConfig.url || '未设置'} (${grokConfig.url === DEFAULT_GROK_URL ? '默认' : '自定义'}) ${isValidUrl(grokConfig.url) ? '✅' : '❌'}\n`;
         output += `- API Key: ${grokKey ? '已设置' : '未设置'} ${grokKey ? `(长度 ${grokKey.length}) ✅` : '❌ (必需)'}\n`;
         output += `- 当前选用模型: ${currentModelVariant || '未设置'} ${currentModelVariant ? '✅' : '❌'}\n`;
         output += `\n其他设置:\n`;
         output += `- 自动优化: ${mergedSettings.autoOptimize ? '开启' : '关闭'}\n`;
         output += `- 延迟: ${mergedSettings.optimizeDelay}ms\n`;
         output += `- 最大长度: ${mergedSettings.maxLength}\n`;
         output += `- 温度: ${mergedSettings.temperature}\n`;
         output += `- 显示按钮: ${mergedSettings.showButton ? '是' : '否'}\n`;
         output += `- 按钮位置: ${mergedSettings.buttonPosition}\n`;
         output += `\n建议:\n`;
         if (!grokKey) output += `- 请设置Grok API Key。\n`;
         if (!isValidUrl(grokConfig.url)) output += `- 请检查Grok API URL格式。\n`;
         if (!currentModelVariant) output += `- 请选择一个模型版本。\n`;
         if (grokKey && isValidUrl(grokConfig.url) && currentModelVariant) {
              output += `- 基本配置完整，建议点击“测试连接”验证。 ✅\n`;
         }

         showDebugOutput(output);
     } catch (error) {
         console.error("Error checking API config:", error);
         showDebugOutput(`检查配置时出错: ${error.message}`);
     }
}

async function testConfiguredApiUrl(url) {
     // Simple HEAD request test to check reachability
      if (!isValidUrl(url)) {
          showDebugOutput(`URL无效，无法测试: ${url}`);
          return;
      }
     showDebugOutput(`测试网络连接到: ${url}...`);
     try {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout for simple HEAD
         const response = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-cache' });
         clearTimeout(timeoutId);
          showDebugOutput(`连接测试结果 (HEAD ${url}):\n- 状态: ${response.status} ${response.statusText} ${response.ok ? '✅' : '❌'}`);
          // Log some headers if available
           if(response.headers.get('server')) showDebugOutput(`- Server: ${response.headers.get('server')}`);
           if(response.headers.get('content-type')) showDebugOutput(`- Content-Type: ${response.headers.get('content-type')}`);

     } catch (error) {
         console.error("Error testing URL:", error);
         showDebugOutput(`连接测试失败 (${url}): ${error.name === 'AbortError' ? '超时' : error.message}`);
     }
}


// --- Utility Functions ---

function showStatus(message, type = 'info', duration = 3000) {
    if (Elements.statusElement) {
        Elements.statusElement.textContent = message;
        Elements.statusElement.className = `status ${type}`; // Ensure 'status' base class is always present
        Elements.statusElement.style.display = 'block';

        // Auto-hide non-error messages
        if (type !== 'error') {
            setTimeout(hideStatus, duration);
        }
    }
     // Also log status for debugging
     if (type === 'error') console.error('Status:', message);
     else if (type === 'warning') console.warn('Status:', message);
     else console.log('Status:', message);
}

function hideStatus() {
    if (Elements.statusElement) {
        Elements.statusElement.textContent = '';
        Elements.statusElement.style.display = 'none';
        Elements.statusElement.className = 'status'; // Reset classes
    }
}

function showTestResult(message, type = 'info') {
     // Similar to showStatus, but for the dedicated test result area
    if (Elements.testResultElement) {
        Elements.testResultElement.textContent = message;
        Elements.testResultElement.className = `status ${type}`;
        Elements.testResultElement.style.display = 'block';

        // Auto-hide non-error test results after a slightly longer duration
        if (type !== 'error') {
            setTimeout(() => {
                 if (Elements.testResultElement) {
                     Elements.testResultElement.textContent = '';
                     Elements.testResultElement.style.display = 'none';
                     Elements.testResultElement.className = 'status';
                 }
            }, 5000);
        }
    }
     // Log test results as well
     if (type === 'error') console.error('Test Result:', message);
     else console.log('Test Result:', message);
}

function showDebugOutput(message) {
    if (Elements.debugOutputDiv) {
        const timestamp = new Date().toLocaleTimeString();
        Elements.debugOutputDiv.textContent += `[${timestamp}] ${message}\n`;
        // Auto-scroll to bottom
        Elements.debugOutputDiv.scrollTop = Elements.debugOutputDiv.scrollHeight;
    }
     console.log(`Debug Output: ${message}`); // Also log to console
}