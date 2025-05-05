// Constants
const MODEL_NAME_GROK = 'grok';
const DEFAULT_MODEL_GROK = 'grok-3-beta';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const STORAGE_KEYS = {
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    CURRENT_MODEL: 'currentModel', // 虽然现在只用Grok，保留以备扩展
    MODEL_VARIANT: 'modelVariant',
};
const DEFAULT_PROMPT_TEMPLATE = '{text}，请用更专业的语言重新组织这段文字，使其更清晰、更有说服力，同时保持原意。';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout

// API Configuration (Simplified for Grok)
const API_CONFIGS = {
    [MODEL_NAME_GROK]: {
        url: GROK_API_URL,
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: 'Grok',
        defaultModel: DEFAULT_MODEL_GROK,
        supportedModels: [ // Consider fetching this dynamically if possible or updating manually
            'grok-3.5',
            'grok-3-beta',
            'grok-3-mini-beta',
            'grok-3-mini-fast-beta',
            'grok-2',
            'grok-1.5'
        ]
    }
};

// Response Cache
const responseCache = new Map();

/**
 * Loads settings from chrome storage.
 * @returns {Promise<object>} Promise resolving to { apiKeys, settings, modelVariant, currentModel }
 */
async function loadSettings() {
    try {
        // Define default settings structure here for safety
        const defaults = {
            [STORAGE_KEYS.API_KEYS]: {},
            [STORAGE_KEYS.SETTINGS]: { /* Add default settings structure if needed */ },
            [STORAGE_KEYS.CURRENT_MODEL]: MODEL_NAME_GROK,
            [STORAGE_KEYS.MODEL_VARIANT]: DEFAULT_MODEL_GROK,
        };
        const result = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));
        console.log('Loaded settings:', result);
        // Ensure essential keys exist, merging with defaults if necessary (optional but safer)
         return { ...defaults, ...result };
    } catch (error) {
        console.error('Failed to load settings:', error);
        // Return default structure on error
        return {
            [STORAGE_KEYS.API_KEYS]: {},
            [STORAGE_KEYS.SETTINGS]: {},
            [STORAGE_KEYS.CURRENT_MODEL]: MODEL_NAME_GROK,
            [STORAGE_KEYS.MODEL_VARIANT]: DEFAULT_MODEL_GROK,
        };
    }
}

// Initialize settings on startup
loadSettings().then(() => {
    console.log('Settings initialized on startup.');
});

/**
 * Gets the prompt string by replacing the placeholder.
 * @param {string} text - The original text.
 * @param {string} promptTemplate - The template string.
 * @returns {string} The formatted prompt.
 */
function getPrompt(text, promptTemplate) {
    const template = promptTemplate || DEFAULT_PROMPT_TEMPLATE;
    return template.replace('{text}', text);
}

/**
 * Gets the effective API configuration, merging base and user settings.
 * @param {object} userSettings - User-specific settings.
 * @param {string} modelType - The type of model (currently only 'grok').
 * @returns {object} The final API configuration.
 */
function getApiConfig(userSettings = {}, modelType = MODEL_NAME_GROK) {
    const baseConfig = API_CONFIGS[modelType];
    if (!baseConfig) {
        console.error(`No base config found for model type: ${modelType}`);
        return null; // Or return a default/error state
    }
    let config = { ...baseConfig }; // Shallow copy

    // Merge user-defined API config if available
    if (userSettings?.apiConfig?.[modelType]) {
        const customConfig = userSettings.apiConfig[modelType];
        if (customConfig.url) config.url = customConfig.url;
        // Note: 'model' (variant) is handled separately via modelVariant setting
    }
    return config;
}

// --- Caching Logic ---

function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, data] of responseCache.entries()) {
        if (now - data.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
     console.log(`Cache cleanup: ${responseCache.size} items remaining.`);
}

setInterval(cleanExpiredCache, 10 * 60 * 1000); // Clean cache every 10 minutes

function getCacheKey(text, modelVariant, temperature, promptTemplate) {
    // Use a more robust key including the template
    return `${text}|${modelVariant}|${temperature}|${promptTemplate}`;
}

// --- Core API Call Logic ---

/**
 * Optimizes the given text using the configured AI model.
 * @param {string} text - The text to optimize.
 * @returns {Promise<object>} Promise resolving to { optimizedText: string, debug?: string } or { error: true, message: string, debug?: string }
 */
async function optimizeText(text) {
    console.log('Optimize request received, text length:', text?.length);
    if (!text || text.trim().length < 5) {
         return { error: true, message: "请输入至少5个字符进行优化。" };
    }

    let settingsData;
    try {
        settingsData = await loadSettings();
    } catch (loadError) {
         console.error("Error loading settings for optimization:", loadError);
         return { error: true, message: "加载扩展设置失败，请稍后重试。" };
    }

    const apiKeys = settingsData[STORAGE_KEYS.API_KEYS] || {};
    const userSettings = settingsData[STORAGE_KEYS.SETTINGS] || {};
    const currentModel = settingsData[STORAGE_KEYS.CURRENT_MODEL] || MODEL_NAME_GROK; // Default to Grok
    const modelVariant = settingsData[STORAGE_KEYS.MODEL_VARIANT] || DEFAULT_MODEL_GROK; // Use saved variant or default
    const temperature = userSettings.temperature ?? 0.7; // Use nullish coalescing
    const promptTemplate = userSettings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
    const maxLength = userSettings.maxLength || 1000;

    // Ensure we are using the Grok model for this logic path
    if (currentModel !== MODEL_NAME_GROK) {
        console.warn(`Optimization requested for unsupported model: ${currentModel}. Falling back to no-op.`);
        return { error: true, message: `当前不支持模型 ${currentModel} 的优化。`, debug: 'Unsupported model fallback' };
    }

    const prompt = getPrompt(text, promptTemplate);
    const cacheKey = getCacheKey(prompt, modelVariant, temperature, promptTemplate);

    if (responseCache.has(cacheKey)) {
        const cachedData = responseCache.get(cacheKey);
        // Check if cached item is an error or success
        if (!cachedData.response.error) {
             console.log('Using cached response for key:', cacheKey);
             return cachedData.response;
        } else {
            console.log('Cached item is an error, skipping cache for key:', cacheKey);
            // Potentially allow retrying if the cached item was a temporary error
        }
    }

    const apiConfig = getApiConfig(userSettings, currentModel);
    const apiKey = apiKeys[currentModel];

    if (!apiConfig || !apiKey) {
        console.warn('API Key or Config missing for model:', currentModel);
        const result = {
            error: true,
            message: "请在设置中配置有效的Grok API密钥和URL以启用优化。",
            debug: 'API Key/Config missing'
        };
         // Cache this "configuration error" state, but perhaps with a shorter TTL or specific handling
        // responseCache.set(cacheKey, { response: result, timestamp: Date.now() }); // Option: Cache config errors
        return result;
    }

    // --- Prepare and Send API Request ---
    const headers = {
        ...apiConfig.headers, // Base headers
        'Authorization': `Bearer ${apiKey.trim()}`
    };

    const bodyPayload = {
        model: modelVariant,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxLength,
        temperature: temperature
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let response;
    try {
        console.log(`Sending request to ${apiConfig.url} with model ${modelVariant}`);
        response = await fetch(apiConfig.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload),
            signal: controller.signal,
            cache: 'no-cache', // Ensure fresh data
            keepalive: true,
            priority: 'high',
        });
    } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error('Fetch API error:', fetchError);
        let message = '网络请求失败，请检查您的网络连接或API URL配置。';
        if (fetchError.name === 'AbortError') {
            message = 'API请求超时，请稍后重试或增加超时时间。';
        }
        const result = { error: true, message: message, debug: `Workspace error: ${fetchError.name}` };
        responseCache.set(cacheKey, { response: result, timestamp: Date.now() }); // Cache network errors
        return result;
    } finally {
         clearTimeout(timeoutId); // Clear timeout regardless of fetch outcome
    }

    // --- Process API Response ---
    let responseData;
    let errorText = '';
    if (!response.ok) {
        try {
            errorText = await response.text();
            responseData = JSON.parse(errorText); // Try parsing error details
        } catch (e) {
            // Error text is not JSON or other parsing error
            console.warn("Could not parse error response body:", e);
        }
        console.error(`API Error: ${response.status}`, errorText);
        let message = `API请求失败 (HTTP ${response.status})。`;
         if (response.status === 401 || response.status === 403) {
            message += ' 请检查您的API密钥是否正确且有效。';
         } else if (response.status >= 500) {
             message += ' 服务器内部错误，请稍后重试。';
         } else if (responseData?.error?.message) {
            message += ` 错误详情: ${responseData.error.message}`;
         } else if (errorText) {
              message += ` 原始错误: ${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`;
         }

        const result = { error: true, message: message, debug: `HTTP ${response.status}` };
        responseCache.set(cacheKey, { response: result, timestamp: Date.now() }); // Cache API errors
        return result;
    }

    try {
        responseData = await response.json();
        console.log('API Response received:', responseData);

        let optimizedText = '';
        let debug = '';

        // Extract optimized text (adjust based on actual Grok API response structure)
        if (responseData.choices && responseData.choices[0]?.message?.content) {
            optimizedText = responseData.choices[0].message.content.trim();
            debug = 'Success (choices[0].message.content)';
        } else if (responseData.choices && responseData.choices[0]?.text) { // Fallback for older/different formats
            optimizedText = responseData.choices[0].text.trim();
             debug = 'Success (choices[0].text)';
        } else if (responseData.text) { // Simplest format
             optimizedText = responseData.text.trim();
             debug = 'Success (text)';
        }
        // Add more specific extraction logic if needed based on Grok's response format

        if (!optimizedText) {
            console.warn('API response successful, but no optimized text found in expected fields.');
             throw new Error('未能从API响应中提取优化后的文本。');
        }

        const result = { optimizedText, debug };
        responseCache.set(cacheKey, { response: result, timestamp: Date.now() });
        return result;

    } catch (parseError) {
        console.error('Error parsing API response:', parseError);
        const result = { error: true, message: '解析API响应失败。', debug: `JSON parse error: ${parseError.message}` };
         // Decide if you want to cache parse errors
         // responseCache.set(cacheKey, { response: result, timestamp: Date.now() });
        return result;
    }
}


/**
 * Tests the API connection for the specified model.
 * Relies on background script's fetch logic.
 * @param {string} modelType - The model type (e.g., 'grok').
 * @param {string} modelName - Specific model variant (e.g., 'grok-3-beta').
 * @param {string} testText - Optional text for the test prompt.
 * @returns {Promise<object>} Promise resolving to { success: boolean, message?: string, error?: string }
 */
async function testApiConnection(modelType = MODEL_NAME_GROK, modelName, testText) {
     console.log(`Testing API connection for ${modelType}, variant: ${modelName || 'default'}`);

     let settingsData;
     try {
         settingsData = await loadSettings();
     } catch (loadError) {
         console.error("Error loading settings for API test:", loadError);
         return { success: false, error: "加载扩展设置失败。" };
     }

     const apiKeys = settingsData[STORAGE_KEYS.API_KEYS] || {};
     const userSettings = settingsData[STORAGE_KEYS.SETTINGS] || {};
     const apiKey = apiKeys[modelType];
     const effectiveModelName = modelName || settingsData[STORAGE_KEYS.MODEL_VARIANT] || API_CONFIGS[modelType]?.defaultModel;

     const apiConfig = getApiConfig(userSettings, modelType);

     if (!apiConfig || !apiKey) {
         return { success: false, error: !apiKey ? 'API密钥未配置。' : 'API配置不正确。' };
     }

     const headers = {
         ...apiConfig.headers,
         'Authorization': `Bearer ${apiKey.trim()}`
     };

     const testMessage = testText || '这是一个API连接测试。';
     const bodyPayload = {
         model: effectiveModelName,
         messages: [{ role: "user", content: testMessage }],
         max_tokens: 50, // Keep test response short
         temperature: 0.7
     };

     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT); // Use same timeout

     try {
         console.log(`Sending test request to ${apiConfig.url} with model ${effectiveModelName}`);
         const response = await fetch(apiConfig.url, {
             method: 'POST',
             headers,
             body: JSON.stringify(bodyPayload),
             signal: controller.signal,
             cache: 'no-cache',
         });
         clearTimeout(timeoutId);

         if (!response.ok) {
             let errorDetails = await response.text();
             console.error('API Test Failed:', response.status, errorDetails);
              try {
                  const errorJson = JSON.parse(errorDetails);
                  if (errorJson.error?.message) {
                      errorDetails = errorJson.error.message;
                  }
              } catch (e) { /* Ignore if not JSON */ }
             return { success: false, error: `API测试失败 (HTTP ${response.status}): ${errorDetails}` };
         }

         const data = await response.json();
         console.log('API Test Response:', data);

         // Try to extract a meaningful response part
          let responseText = '';
          if (data.choices && data.choices[0]?.message?.content) {
              responseText = data.choices[0].message.content.trim();
          } else if (data.choices && data.choices[0]?.text) {
              responseText = data.choices[0].text.trim();
          } else if (data.text) {
              responseText = data.text.trim();
          } else if (data.id) {
              // If no text, confirm connection with ID
              responseText = `连接成功，收到响应 ID: ${data.id}`;
          } else {
              responseText = '连接成功，但未在响应中找到预期文本。';
          }

         return { success: true, message: responseText };

     } catch (error) {
         clearTimeout(timeoutId);
         console.error('API Test Fetch Error:', error);
          let message = '测试请求失败，请检查网络或URL。';
          if (error.name === 'AbortError') {
              message = 'API测试请求超时。';
          }
         return { success: false, error: `${message} (${error.message || '未知网络错误'})` };
     }
}


// --- Event Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);

    if (request.action === 'ping') {
        sendResponse({ status: 'ok', timestamp: Date.now() });
        return true; // Indicate async response possible (though not used here)
    }

    if (request.action === 'optimizeText') {
        optimizeText(request.text)
            .then(sendResponse)
            .catch(error => {
                console.error('Error processing optimizeText request:', error);
                // Ensure an error object is sent back
                sendResponse({ error: true, message: error.message || '处理优化请求时发生未知错误。' });
            });
        return true; // Indicate async response
    }

    if (request.action === 'testApiConnection') {
        testApiConnection(request.model, request.modelName, request.text)
            .then(sendResponse)
            .catch(error => {
                console.error('Error processing testApiConnection request:', error);
                sendResponse({ success: false, error: error.message || '处理API测试请求时发生未知错误。' });
            });
        return true; // Indicate async response
    }

     // Listen for settings updates to clear cache
     if (request.action === 'settingsUpdated') {
         console.log('Settings updated signal received, clearing response cache.');
         responseCache.clear();
         // Optional: Re-load settings in background immediately if needed
         // loadSettings();
         sendResponse({ success: true }); // Acknowledge
         return true;
     }

    // Note: 'switchModel' action removed as we focus on Grok for now

    // Default case for unhandled actions
    console.warn('Unhandled action received:', request.action);
    // sendResponse({ error: true, message: `Unknown action: ${request.action}` }); // Optional: Respond with error
    return false; // No async response intended
});

// On Install/Update
chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);
    if (details.reason === 'install') {
        console.log('Performing first-time setup: Initializing default settings.');
        // Initialize default settings
        chrome.storage.sync.set({
            [STORAGE_KEYS.CURRENT_MODEL]: MODEL_NAME_GROK,
            [STORAGE_KEYS.MODEL_VARIANT]: DEFAULT_MODEL_GROK,
            [STORAGE_KEYS.API_KEYS]: {}, // Empty keys initially
            [STORAGE_KEYS.SETTINGS]: { // Default functional settings
                autoOptimize: false,
                optimizeDelay: 1000,
                maxLength: 1500, // Increased default max length
                temperature: 0.7,
                promptTemplate: DEFAULT_PROMPT_TEMPLATE,
                showButton: true,
                buttonPosition: 'right',
                showDebugInfo: false, // Keep debug off by default
                 apiConfig: { // Ensure default API config structure exists
                     [MODEL_NAME_GROK]: {
                         url: GROK_API_URL,
                         // Model variant is stored separately in MODEL_VARIANT
                     }
                 }
            }
        }).then(() => {
            console.log('Default settings initialized successfully.');
        }).catch(error => {
            console.error('Failed to initialize default settings:', error);
        });
    } else if (details.reason === 'update') {
         // Potentially run migration logic for settings if needed between versions
         console.log('Extension updated to version:', chrome.runtime.getManifest().version);
         // Example: Check if a new setting needs a default value
         // loadSettings().then(settings => { /* Check and update */ });
    }
});

console.log('Background script loaded and running.');