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
    buttonVisibility: document.getElementById('buttonVisibility'),
    toggleShortcut: document.getElementById('toggleShortcut'),
    // Model Selection
    currentModel: document.getElementById('current-model'),
    // Grok API Settings
    grokUrl: document.getElementById('grok-url'),
    grokKey: document.getElementById('grok-key'),
    grokModel: document.getElementById('grok-model'),
    testGrokButton: document.getElementById('test-grok'),
    toggleGrokKey: document.getElementById('toggle-grok-key'),
    grokConfigSection: document.getElementById('grok-config'),
    // Claude API Settings
    claudeUrl: document.getElementById('claude-url'),
    claudeKey: document.getElementById('claude-key'),
    claudeModel: document.getElementById('claude-model'),
    testClaudeButton: document.getElementById('test-claude'),
    toggleClaudeKey: document.getElementById('toggle-claude-key'),
    claudeConfigSection: document.getElementById('claude-config'),
    // Gemini API Settings
    geminiUrl: document.getElementById('gemini-url'),
    geminiKey: document.getElementById('gemini-key'),
    geminiModel: document.getElementById('gemini-model'),
    testGeminiButton: document.getElementById('test-gemini'),
    toggleGeminiKey: document.getElementById('toggle-gemini-key'),
    geminiConfigSection: document.getElementById('gemini-config'),
    // Custom API Settings
    customUrl: document.getElementById('custom-url'),
    customKey: document.getElementById('custom-key'),
    customModel: document.getElementById('custom-model'),
    customRequestFormat: document.getElementById('custom-request-format'),
    customResponsePath: document.getElementById('custom-response-path'),
    testCustomButton: document.getElementById('test-custom'),
    toggleCustomKey: document.getElementById('toggle-custom-key'),
    customConfigSection: document.getElementById('custom-config'),
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
const MODEL_NAME_CLAUDE = 'claude';
const MODEL_NAME_GEMINI = 'gemini';
const MODEL_NAME_CUSTOM = 'custom';

const DEFAULT_GROK_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

const DEFAULT_GROK_MODEL = 'grok-3-beta';
const DEFAULT_CLAUDE_MODEL = 'claude-3-5-sonnet-20240620';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-pro';
const DEFAULT_CUSTOM_MODEL = 'custom-model';

const STORAGE_KEYS = { // Match background script
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    CURRENT_MODEL: 'currentModel',
    MODEL_VARIANT: 'modelVariant',
    CUSTOM_CONFIG: 'customConfig'
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
    buttonVisibility: 'focus',
    toggleShortcut: 'Alt+O',
    apiConfig: {
        [MODEL_NAME_GROK]: {
            url: DEFAULT_GROK_URL,
            // Model variant stored separately
        },
        [MODEL_NAME_CLAUDE]: {
            url: DEFAULT_CLAUDE_URL,
        },
        [MODEL_NAME_GEMINI]: {
            url: DEFAULT_GEMINI_URL,
        },
        [MODEL_NAME_CUSTOM]: {
            url: '',
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
        Elements.buttonVisibility.value = settings.buttonVisibility ?? 'focus';
        Elements.toggleShortcut.value = settings.toggleShortcut || DEFAULT_SETTINGS.toggleShortcut;

        // Current Model Selection
        const currentModel = settings[STORAGE_KEYS.CURRENT_MODEL] || MODEL_NAME_GROK;
        Elements.currentModel.value = currentModel;
        
        // 隐藏所有模型配置部分
        document.querySelectorAll('.model-config').forEach(section => {
            section.style.display = 'none';
        });
        
        // 显示当前选择的模型配置部分
        switch(currentModel) {
            case MODEL_NAME_GROK:
                Elements.grokConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_CLAUDE:
                Elements.claudeConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_GEMINI:
                Elements.geminiConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_CUSTOM:
                Elements.customConfigSection.style.display = 'block';
                break;
        }

        // API Config - Grok specific
        const grokConfig = settings.apiConfig?.[MODEL_NAME_GROK] || {};
        Elements.grokUrl.value = grokConfig.url || DEFAULT_GROK_URL;
        Elements.grokKey.value = apiKeys[MODEL_NAME_GROK] || '';
        
        // Claude API settings
        const claudeConfig = settings.apiConfig?.[MODEL_NAME_CLAUDE] || {};
        Elements.claudeUrl.value = claudeConfig.url || DEFAULT_CLAUDE_URL;
        Elements.claudeKey.value = apiKeys[MODEL_NAME_CLAUDE] || '';
        
        // Gemini API settings
        const geminiConfig = settings.apiConfig?.[MODEL_NAME_GEMINI] || {};
        Elements.geminiUrl.value = geminiConfig.url || DEFAULT_GEMINI_URL;
        Elements.geminiKey.value = apiKeys[MODEL_NAME_GEMINI] || '';
        
        // Custom API settings
        const customConfig = settings.apiConfig?.[MODEL_NAME_CUSTOM] || {};
        Elements.customUrl.value = customConfig.url || '';
        Elements.customKey.value = apiKeys[MODEL_NAME_CUSTOM] || '';
        Elements.customModel.value = customConfig.model || DEFAULT_CUSTOM_MODEL;
        
        // 处理自定义格式配置
        const customExtendedConfig = settings[STORAGE_KEYS.CUSTOM_CONFIG] || {};
        Elements.customRequestFormat.value = customExtendedConfig.requestFormat || '';
        Elements.customResponsePath.value = customExtendedConfig.responsePath || '';
        
        // Model Variant Selection for specific models
        const effectiveModelVariant = modelVariant || '';
        
        // 根据当前选择的模型类型，设置相应的模型变体
        if (currentModel === MODEL_NAME_GROK && effectiveModelVariant) {
            setModelDropdownValue(Elements.grokModel, effectiveModelVariant);
        } else if (currentModel === MODEL_NAME_CLAUDE && effectiveModelVariant) {
            setModelDropdownValue(Elements.claudeModel, effectiveModelVariant);
        } else if (currentModel === MODEL_NAME_GEMINI && effectiveModelVariant) {
            setModelDropdownValue(Elements.geminiModel, effectiveModelVariant);
        }

    } catch (error) {
        console.error("Error updating UI:", error);
        showStatus(`UI更新失败: ${error.message}`, 'error');
    }
}

// 设置模型下拉框的值，如果值不存在则添加选项
function setModelDropdownValue(dropdownElement, modelValue) {
    if (!dropdownElement || !modelValue) return;
    
    // 检查值是否已存在于下拉列表中
    if (Array.from(dropdownElement.options).some(opt => opt.value === modelValue)) {
        dropdownElement.value = modelValue;
    } else {
        console.warn(`Saved model variant "${modelValue}" not found in dropdown. Adding it.`);
        // 添加选项并选中
        const option = document.createElement('option');
        option.value = modelValue;
        option.textContent = `${modelValue} (已保存)`;
        dropdownElement.appendChild(option);
        dropdownElement.value = modelValue;
    }
}

// --- Event Listeners Setup ---

function setupEventListeners() {
    // Temperature slider visual feedback
    Elements.temperature.addEventListener('input', () => {
        Elements.temperatureValue.textContent = Elements.temperature.value;
    });

    // API Key toggle visibility for each service
    setupPasswordToggle(Elements.toggleGrokKey, Elements.grokKey);
    setupPasswordToggle(Elements.toggleClaudeKey, Elements.claudeKey);
    setupPasswordToggle(Elements.toggleGeminiKey, Elements.geminiKey);
    setupPasswordToggle(Elements.toggleCustomKey, Elements.customKey);
    
    // API Connection test button handlers
    Elements.testGrokButton.addEventListener('click', () => testApiConnection(MODEL_NAME_GROK));
    Elements.testClaudeButton.addEventListener('click', () => testApiConnection(MODEL_NAME_CLAUDE));
    Elements.testGeminiButton.addEventListener('click', () => testApiConnection(MODEL_NAME_GEMINI));
    Elements.testCustomButton.addEventListener('click', () => testApiConnection(MODEL_NAME_CUSTOM));
    
    // Model section visibility based on current selection
    Elements.currentModel.addEventListener('change', function() {
        const selectedModel = this.value;
        // 隐藏所有配置部分
        document.querySelectorAll('.model-config').forEach(section => {
            section.style.display = 'none';
        });
        
        // 显示当前选择的模型配置
        switch(selectedModel) {
            case MODEL_NAME_GROK:
                Elements.grokConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_CLAUDE:
                Elements.claudeConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_GEMINI:
                Elements.geminiConfigSection.style.display = 'block';
                break;
            case MODEL_NAME_CUSTOM:
                Elements.customConfigSection.style.display = 'block';
                break;
        }
    });

    // Main save button
    Elements.saveButton.addEventListener('click', saveSettings);

    // Debug buttons
    if (Elements.checkPermissionsButton) {
        Elements.checkPermissionsButton.addEventListener('click', checkPermissions);
    }
    if (Elements.checkApiConfigButton) {
        Elements.checkApiConfigButton.addEventListener('click', checkApiConfig);
    }
    if (Elements.testFetchButton) {
        Elements.testFetchButton.addEventListener('click', () => testConfiguredApiUrl(Elements.grokUrl.value));
    }

    // Model dropdown refresh button handlers
    if (Elements.refreshModelsButton) {
        Elements.refreshModelsButton.addEventListener('click', handleRefreshModels);
    }
}

// Helper for password toggle buttons
function setupPasswordToggle(toggleElement, inputElement) {
    if (!toggleElement || !inputElement) return;
    
    toggleElement.addEventListener('click', () => {
        const type = inputElement.type === 'password' ? 'text' : 'password';
        inputElement.type = type;
        toggleElement.textContent = type === 'password' ? '👁️' : '🔒';
    });
}

// --- Core Logic Functions ---

/**
 * Validates settings before saving.
 * @param {object} settings - The settings object to validate
 * @param {string} apiKey - API key for the currently selected model
 * @returns {string|null} Error message if validation fails, null if valid
 */
function validateSettings(settings, apiKey) {
    // 基本验证
    if (settings.optimizeDelay < 100) {
        return "优化延迟不能小于100毫秒";
    }
    
    if (settings.maxLength < 100 || settings.maxLength > 10000) {
        return "最大输出长度必须在100到10000之间";
    }
    
    if (settings.temperature < 0 || settings.temperature > 2 || isNaN(settings.temperature)) {
        return "温度参数必须在0到2之间";
    }
    
    if (!settings.promptTemplate || !settings.promptTemplate.includes('{text}')) {
        return "提示模板必须包含{text}占位符";
    }
    
    // 根据当前模型验证API配置
    const currentModel = settings[STORAGE_KEYS.CURRENT_MODEL] || MODEL_NAME_GROK;
    const apiConfig = settings.apiConfig?.[currentModel];
    
    if (!apiConfig || !apiConfig.url) {
        return `${currentModel}模型的API URL未配置`;
    }
    
    if (!isValidUrl(apiConfig.url)) {
        return `${currentModel}模型的API URL格式无效`;
    }
    
    if (!apiKey) {
        return `${currentModel}模型的API密钥未配置`;
    }
    
    // 对于自定义API的特殊验证
    if (currentModel === MODEL_NAME_CUSTOM) {
        // 检查自定义模型名称
        if (!apiConfig.model) {
            return "自定义API模型名称未设置";
        }
        
        // 如果提供了自定义请求格式，验证其是否为有效的JSON
        const customConfig = settings[STORAGE_KEYS.CUSTOM_CONFIG] || {};
        if (customConfig.requestFormat) {
            try {
                JSON.parse(customConfig.requestFormat);
            } catch (e) {
                return "自定义请求格式不是有效的JSON格式";
            }
        }
    }
    
    return null; // 验证通过
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
    try {
        // 显示保存中状态
        showStatus('正在保存设置...', 'info');
        
        // 获取当前选择的模型类型
        const currentModel = Elements.currentModel.value;
        
        // 根据当前选择的模型，获取对应的模型变体值
        let modelVariant = '';
        switch(currentModel) {
            case MODEL_NAME_GROK:
                modelVariant = Elements.grokModel.value;
                break;
            case MODEL_NAME_CLAUDE:
                modelVariant = Elements.claudeModel.value;
                break;
            case MODEL_NAME_GEMINI:
                modelVariant = Elements.geminiModel.value;
                break;
            case MODEL_NAME_CUSTOM:
                modelVariant = Elements.customModel.value;
                break;
        }

        // 构建设置对象
        const newSettings = {
            // 基本设置
            autoOptimize: Elements.autoOptimize.checked,
            optimizeDelay: parseInt(Elements.optimizeDelay.value, 10),
            maxLength: parseInt(Elements.maxLength.value, 10),
            temperature: parseFloat(Elements.temperature.value),
            promptTemplate: Elements.promptTemplate.value,
            
            // 界面设置
            showButton: Elements.showButton.checked,
            buttonPosition: Elements.buttonPosition.value,
            showDebugInfo: Elements.showDebugInfo.checked,
            buttonVisibility: Elements.buttonVisibility.value,
            toggleShortcut: Elements.toggleShortcut.value,
            
            // API配置
            apiConfig: {
                [MODEL_NAME_GROK]: {
                    url: Elements.grokUrl.value.trim()
                },
                [MODEL_NAME_CLAUDE]: {
                    url: Elements.claudeUrl.value.trim()
                },
                [MODEL_NAME_GEMINI]: {
                    url: Elements.geminiUrl.value.trim()
                },
                [MODEL_NAME_CUSTOM]: {
                    url: Elements.customUrl.value.trim(),
                    model: Elements.customModel.value.trim()
                }
            }
        };
        
        // 构建API密钥对象
        const apiKeys = {
            [MODEL_NAME_GROK]: Elements.grokKey.value.trim(),
            [MODEL_NAME_CLAUDE]: Elements.claudeKey.value.trim(),
            [MODEL_NAME_GEMINI]: Elements.geminiKey.value.trim(),
            [MODEL_NAME_CUSTOM]: Elements.customKey.value.trim()
        };
        
        // 构建自定义API配置
        const customConfig = {
            requestFormat: Elements.customRequestFormat.value.trim(),
            responsePath: Elements.customResponsePath.value.trim()
        };

        // 验证核心设置
        const invalidSettings = validateSettings(newSettings, apiKeys[currentModel]);
        if (invalidSettings) {
            showStatus(`保存失败: ${invalidSettings}`, 'error');
            return;
        }

        // 保存设置到Chrome存储
        await chrome.storage.sync.set({
            [STORAGE_KEYS.SETTINGS]: newSettings,
            [STORAGE_KEYS.API_KEYS]: apiKeys,
            [STORAGE_KEYS.CURRENT_MODEL]: currentModel,
            [STORAGE_KEYS.MODEL_VARIANT]: modelVariant,
            [STORAGE_KEYS.CUSTOM_CONFIG]: customConfig
        });
        
        showStatus('设置已成功保存！', 'success');
        console.log('Settings saved:', {
            settings: newSettings,
            currentModel,
            modelVariant,
            // 不记录API密钥，保护安全
        });

    } catch (error) {
        console.error("Error saving settings:", error);
        showStatus(`保存设置失败: ${error.message}`, 'error');
    }
}


// --- API Interaction (via Background Script) ---

/**
 * Tests the API connection for the selected model.
 * @param {string} modelType - The model type (grok, claude, gemini, custom)
 * @returns {Promise<void>}
 */
async function testApiConnection(modelType) {
    try {
        showTestResult('连接测试中...', 'info');
        
        let apiUrl, apiKey, modelVariant, customConfig;
        
        // 获取当前测试的模型相关配置
        switch(modelType) {
            case MODEL_NAME_GROK:
                apiUrl = Elements.grokUrl.value.trim();
                apiKey = Elements.grokKey.value.trim();
                modelVariant = Elements.grokModel.value;
                break;
            case MODEL_NAME_CLAUDE:
                apiUrl = Elements.claudeUrl.value.trim();
                apiKey = Elements.claudeKey.value.trim();
                modelVariant = Elements.claudeModel.value;
                break;
            case MODEL_NAME_GEMINI:
                apiUrl = Elements.geminiUrl.value.trim();
                apiKey = Elements.geminiKey.value.trim();
                modelVariant = Elements.geminiModel.value;
                break;
            case MODEL_NAME_CUSTOM:
                apiUrl = Elements.customUrl.value.trim();
                apiKey = Elements.customKey.value.trim();
                modelVariant = Elements.customModel.value.trim();
                customConfig = {
                    requestFormat: Elements.customRequestFormat.value.trim(),
                    responsePath: Elements.customResponsePath.value.trim()
                };
                break;
            default:
                throw new Error(`未知模型类型: ${modelType}`);
        }
        
        // 基本验证
        if (!apiUrl || !isValidUrl(apiUrl)) {
            showTestResult(`API URL无效: ${apiUrl}`, 'error');
            return;
        }
        
        if (!apiKey) {
            showTestResult('API密钥未设置', 'error');
            return;
        }
        
        if (!modelVariant) {
            showTestResult('模型版本未选择', 'error');
            return;
        }
        
        // 准备测试请求的消息
        showDebugOutput(`测试${modelType} API连接...\nURL: ${apiUrl}\n模型: ${modelVariant}`);
        
        // 构建API测试请求
        const testMessage = "这是一个API连接测试。";
        const headers = { 'Content-Type': 'application/json' };
        let url = apiUrl;
        let bodyPayload;
        
        switch(modelType) {
            case MODEL_NAME_GROK:
                headers['Authorization'] = `Bearer ${apiKey}`;
                bodyPayload = {
                    model: modelVariant,
                    messages: [{ role: "user", content: testMessage }],
                    max_tokens: 20,
                    temperature: 0.7
                };
                break;
                
            case MODEL_NAME_CLAUDE:
                headers['Authorization'] = `Bearer ${apiKey}`;
                headers['anthropic-version'] = '2023-06-01';
                bodyPayload = {
                    model: modelVariant,
                    messages: [{ role: "user", content: testMessage }],
                    max_tokens: 20
                };
                break;
                
            case MODEL_NAME_GEMINI:
                // Gemini使用URL参数而非Authorization头
                url = `${apiUrl}?key=${apiKey}`;
                bodyPayload = {
                    contents: [{ role: "user", parts: [{ text: testMessage }] }],
                    generationConfig: {
                        maxOutputTokens: 20,
                        temperature: 0.7
                    }
                };
                break;
                
            case MODEL_NAME_CUSTOM:
                headers['Authorization'] = `Bearer ${apiKey}`;
                // 默认使用OpenAI兼容格式
                bodyPayload = {
                    model: modelVariant,
                    messages: [{ role: "user", content: testMessage }],
                    max_tokens: 20,
                    temperature: 0.7
                };
                
                // 应用自定义请求格式（如果有）
                if (customConfig.requestFormat) {
                    try {
                        const customPayload = JSON.parse(customConfig.requestFormat);
                        const stringified = JSON.stringify(customPayload)
                            .replace(/"__PROMPT__"/g, JSON.stringify(testMessage))
                            .replace(/"__MODEL__"/g, JSON.stringify(modelVariant))
                            .replace(/"__TEMPERATURE__"/g, 0.7)
                            .replace(/"__MAX_TOKENS__"/g, 20);
                        bodyPayload = JSON.parse(stringified);
                    } catch (e) {
                        console.error("Error applying custom request format:", e);
                        showTestResult("自定义请求格式JSON解析错误", 'error');
                        return;
                    }
                }
                break;
        }
        
        // 发送测试请求
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
        
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorDetails = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.message) {
                    errorDetails = errorJson.error.message;
                }
            } catch (e) { /* 非JSON错误响应，使用原始文本 */ }
            
            showTestResult(`API测试失败 (HTTP ${response.status}): ${errorDetails}`, 'error');
            return;
        }
        
        // 处理成功响应
        const data = await response.json();
        showDebugOutput(`API测试响应: ${JSON.stringify(data, null, 2)}`);
        
        // 提取响应文本（根据不同模型格式）
        let responseText = '';
        switch(modelType) {
            case MODEL_NAME_GROK:
                if (data.choices && data.choices[0]?.message?.content) {
                    responseText = data.choices[0].message.content;
                } else if (data.id) {
                    responseText = `连接成功，响应ID: ${data.id}`;
                }
                break;
                
            case MODEL_NAME_CLAUDE:
                if (data.content && data.content[0]?.text) {
                    responseText = data.content[0].text;
                } else if (data.id) {
                    responseText = `连接成功，响应ID: ${data.id}`;
                }
                break;
                
            case MODEL_NAME_GEMINI:
                if (data.candidates && data.candidates[0]?.content?.parts) {
                    const parts = data.candidates[0].content.parts;
                    const texts = parts.map(part => part.text || '').filter(Boolean);
                    responseText = texts.join(' ');
                }
                break;
                
            case MODEL_NAME_CUSTOM:
                // 尝试使用自定义路径
                if (customConfig.responsePath) {
                    try {
                        const path = customConfig.responsePath.split('.');
                        let result = data;
                        for (const key of path) {
                            result = result[key];
                        }
                        if (result && typeof result === 'string') {
                            responseText = result;
                        }
                    } catch (e) {
                        console.warn("Failed to extract response using custom path:", e);
                    }
                }
                
                // 尝试标准格式
                if (!responseText) {
                    if (data.choices && data.choices[0]?.message?.content) {
                        responseText = data.choices[0].message.content;
                    } else if (data.text) {
                        responseText = data.text;
                    } else if (data.content) {
                        responseText = typeof data.content === 'string' ? data.content : '响应成功（对象格式）';
                    } else if (data.id) {
                        responseText = `连接成功，响应ID: ${data.id}`;
                    }
                }
                break;
        }
        
        if (!responseText) {
            responseText = "API连接成功，但返回格式不符合预期";
        }
        
        showTestResult(`API连接测试成功: ${responseText.substring(0, 100)}`, 'success');
        
    } catch (error) {
        console.error("API连接测试错误:", error);
        if (error.name === 'AbortError') {
            showTestResult('API请求超时，请检查网络或API端点', 'error');
        } else {
            showTestResult(`API测试失败: ${error.message}`, 'error');
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
    showDebugOutput('检查当前API配置...');
    try {
        const { settings = {}, apiKeys = {}, modelVariant, customConfig = {} } = await chrome.storage.sync.get([
            STORAGE_KEYS.SETTINGS, STORAGE_KEYS.API_KEYS, STORAGE_KEYS.MODEL_VARIANT, STORAGE_KEYS.CUSTOM_CONFIG
        ]);
        const mergedSettings = mergeDeep(DEFAULT_SETTINGS, settings);
        const currentModel = mergedSettings[STORAGE_KEYS.CURRENT_MODEL] || MODEL_NAME_GROK;

        let output = `当前选择的模型: ${currentModel}\n\n`;
        
        // 检查所有模型配置
        output += `Grok 配置:\n`;
        const grokConfig = mergedSettings.apiConfig?.[MODEL_NAME_GROK] || {};
        const grokKey = apiKeys[MODEL_NAME_GROK] || '';
        output += `- API URL: ${grokConfig.url || '未设置'} (${grokConfig.url === DEFAULT_GROK_URL ? '默认' : '自定义'}) ${isValidUrl(grokConfig.url) ? '✅' : '❌'}\n`;
        output += `- API Key: ${grokKey ? '已设置' : '未设置'} ${grokKey ? `(长度: ${grokKey.length}) ✅` : '❌'}\n`;
        
        output += `\nClaude 配置:\n`;
        const claudeConfig = mergedSettings.apiConfig?.[MODEL_NAME_CLAUDE] || {};
        const claudeKey = apiKeys[MODEL_NAME_CLAUDE] || '';
        output += `- API URL: ${claudeConfig.url || '未设置'} (${claudeConfig.url === DEFAULT_CLAUDE_URL ? '默认' : '自定义'}) ${isValidUrl(claudeConfig.url) ? '✅' : '❌'}\n`;
        output += `- API Key: ${claudeKey ? '已设置' : '未设置'} ${claudeKey ? `(长度: ${claudeKey.length}) ✅` : '❌'}\n`;
        
        output += `\nGemini 配置:\n`;
        const geminiConfig = mergedSettings.apiConfig?.[MODEL_NAME_GEMINI] || {};
        const geminiKey = apiKeys[MODEL_NAME_GEMINI] || '';
        output += `- API URL: ${geminiConfig.url || '未设置'} (${geminiConfig.url === DEFAULT_GEMINI_URL ? '默认' : '自定义'}) ${isValidUrl(geminiConfig.url) ? '✅' : '❌'}\n`;
        output += `- API Key: ${geminiKey ? '已设置' : '未设置'} ${geminiKey ? `(长度: ${geminiKey.length}) ✅` : '❌'}\n`;
        
        output += `\n自定义API配置:\n`;
        const customApiConfig = mergedSettings.apiConfig?.[MODEL_NAME_CUSTOM] || {};
        const customKey = apiKeys[MODEL_NAME_CUSTOM] || '';
        output += `- API URL: ${customApiConfig.url || '未设置'} ${isValidUrl(customApiConfig.url) ? '✅' : '❌'}\n`;
        output += `- API Key: ${customKey ? '已设置' : '未设置'} ${customKey ? `(长度: ${customKey.length}) ✅` : '❌'}\n`;
        output += `- 模型名称: ${customApiConfig.model || '未设置'} ${customApiConfig.model ? '✅' : '❌'}\n`;
        output += `- 自定义请求格式: ${customConfig.requestFormat ? '已设置' : '未设置'}\n`;
        output += `- 响应路径: ${customConfig.responsePath || '自动检测'}\n`;
        
        // 检查当前选择的模型变体
        const currentModelVariant = modelVariant || 
            (currentModel === MODEL_NAME_GROK ? DEFAULT_GROK_MODEL : 
             currentModel === MODEL_NAME_CLAUDE ? DEFAULT_CLAUDE_MODEL :
             currentModel === MODEL_NAME_GEMINI ? DEFAULT_GEMINI_MODEL :
             customApiConfig.model || DEFAULT_CUSTOM_MODEL);
        
        output += `\n当前使用的模型变体: ${currentModelVariant}\n`;
        
        // 检查其他设置
        output += `\n其他设置:\n`;
        output += `- 自动优化: ${mergedSettings.autoOptimize ? '开启' : '关闭'}\n`;
        output += `- 延迟: ${mergedSettings.optimizeDelay}ms\n`;
        output += `- 最大长度: ${mergedSettings.maxLength} tokens\n`;
        output += `- 温度: ${mergedSettings.temperature}\n`;
        output += `- 显示按钮: ${mergedSettings.showButton ? '是' : '否'}\n`;
        output += `- 按钮位置: ${mergedSettings.buttonPosition}\n`;
        output += `- 按钮可见性: ${getButtonVisibilityDisplayName(mergedSettings.buttonVisibility)}\n`;
        output += `- 热键触发: ${mergedSettings.toggleShortcut || '未设置'}\n`;
        
        // 提供建议
        output += `\n建议操作:\n`;
        switch(currentModel) {
            case MODEL_NAME_GROK:
                if (!grokKey) output += `- 请设置Grok API Key\n`;
                if (!isValidUrl(grokConfig.url)) output += `- 请检查Grok API URL格式\n`;
                break;
            case MODEL_NAME_CLAUDE:
                if (!claudeKey) output += `- 请设置Claude API Key\n`;
                if (!isValidUrl(claudeConfig.url)) output += `- 请检查Claude API URL格式\n`;
                break;
            case MODEL_NAME_GEMINI:
                if (!geminiKey) output += `- 请设置Gemini API Key\n`;
                if (!isValidUrl(geminiConfig.url)) output += `- 请检查Gemini API URL格式\n`;
                break;
            case MODEL_NAME_CUSTOM:
                if (!customKey) output += `- 请设置自定义API Key\n`;
                if (!isValidUrl(customApiConfig.url)) output += `- 请检查自定义API URL格式\n`;
                if (!customApiConfig.model) output += `- 请设置自定义模型名称\n`;
                break;
        }

        showDebugOutput(output);
    } catch (error) {
        console.error("Error checking API config:", error);
        showDebugOutput(`检查API配置时出错: ${error.message}`);
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

// 添加辅助函数来获取按钮可见性的显示名称
function getButtonVisibilityDisplayName(value) {
    const names = {
        'always': '始终可见',
        'focus': '仅在输入框聚焦/悬停时显示',
        'hidden': '完全隐藏'
    };
    return names[value] || value;
}

// Optionally in generateSettingsText (if previews settings export)
function generateSettingsText(mergedSettings) {
    let output = '# AI文本优化器设置\n\n';
    // ... existing code ...
    output += `- 按钮可见性: ${getButtonVisibilityDisplayName(mergedSettings.buttonVisibility)}\n`;
    output += `- 热键触发: ${mergedSettings.toggleShortcut}\n`;
    // ... existing code ...
    return output;
}