// Constants
const MODEL_NAME_GROK = 'grok';
const MODEL_NAME_CLAUDE = 'claude';
const MODEL_NAME_GEMINI = 'gemini';
const MODEL_NAME_CUSTOM = 'custom';

const DEFAULT_MODEL_GROK = 'grok-3-beta';
const DEFAULT_MODEL_CLAUDE = 'claude-3-7-sonnet-20250219';
const DEFAULT_MODEL_GEMINI = 'gemini-2.5-flash-preview-04-17';
const DEFAULT_MODEL_CUSTOM = 'custom-model';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent';
const CUSTOM_API_URL = '';

const STORAGE_KEYS = {
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    CURRENT_MODEL: 'currentModel',
    MODEL_VARIANT: 'modelVariant',
    CUSTOM_CONFIG: 'customConfig',
};
const DEFAULT_PROMPT_TEMPLATE = '{text}，请用更专业的语言重新组织这段文字，使其更清晰、更有说服力，同时保持原意。';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout

// API Configuration for multiple models
const API_CONFIGS = {
    [MODEL_NAME_GROK]: {
        url: GROK_API_URL,
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: 'Grok',
        defaultModel: DEFAULT_MODEL_GROK,
        supportedModels: [
            'grok-4',
            'grok-3.5-turbo',
            'grok-3.5',
            'grok-3-beta',
            'grok-3-mini-plus',
            'grok-3-mini-beta',
            'grok-3-mini-fast-beta',
            'grok-2',
            'grok-1.5'
        ]
    },
    [MODEL_NAME_CLAUDE]: {
        url: CLAUDE_API_URL,
        headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        },
        displayName: 'Claude',
        defaultModel: DEFAULT_MODEL_CLAUDE,
        supportedModels: [
            'claude-3-7-sonnet-20250219',
            'claude-3-7-sonnet-latest',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-latest',
            'claude-3-5-sonnet-20240620',
            'claude-3-5-haiku-20241022',
            'claude-3-5-haiku-latest',
            'claude-3-opus-20240229',
            'claude-3-opus-latest',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
            'claude-2.1',
            'claude-2.0',
            'claude-instant-1.2'
        ]
    },
    [MODEL_NAME_GEMINI]: {
        url: GEMINI_API_URL,
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: 'Gemini',
        defaultModel: DEFAULT_MODEL_GEMINI,
        supportedModels: [
            'gemini-2.5-flash-preview-04-17',
            'gemini-2.5-pro-preview-03-25',
            'gemini-2.0-flash',
            'gemini-2.0-flash-live-001',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash-lite-001',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash',
            'gemini-1.5-flash-002',
            'gemini-1.5-flash-001',
            'gemini-1.5-flash-8b-latest',
            'gemini-1.5-flash-8b',
            'gemini-1.5-flash-8b-001',
            'gemini-1.5-pro-latest',
            'gemini-1.5-pro',
            'gemini-1.5-pro-002',
            'gemini-1.5-pro-001'
        ]
    },
    [MODEL_NAME_CUSTOM]: {
        url: CUSTOM_API_URL,
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: '自定义 API',
        defaultModel: DEFAULT_MODEL_CUSTOM,
        supportedModels: [
            DEFAULT_MODEL_CUSTOM
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
    const modelVariant = settingsData[STORAGE_KEYS.MODEL_VARIANT] || API_CONFIGS[currentModel]?.defaultModel; // Use saved variant or default
    const temperature = userSettings.temperature ?? 0.7; // Use nullish coalescing
    const promptTemplate = userSettings.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
    const maxLength = userSettings.maxLength || 1000;
    const customConfig = settingsData[STORAGE_KEYS.CUSTOM_CONFIG] || {};

    // Check if model is supported
    if (!API_CONFIGS[currentModel]) {
        console.warn(`Optimization requested for unknown model: ${currentModel}.`);
        return { error: true, message: `不支持的模型类型: ${currentModel}。`, debug: 'Unknown model type' };
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
            message: `请在设置中配置有效的${apiConfig?.displayName || currentModel} API密钥和URL以启用优化。`,
            debug: 'API Key/Config missing'
        };
        return result;
    }

    // --- Prepare and Send API Request ---
    const headers = {
        ...apiConfig.headers, // Base headers
        'Authorization': `Bearer ${apiKey.trim()}`
    };

    // Prepare request body based on model type
    let bodyPayload;
    
    switch(currentModel) {
        case MODEL_NAME_GROK:
            bodyPayload = {
                model: modelVariant,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxLength,
                temperature: temperature
            };
            break;
            
        case MODEL_NAME_CLAUDE:
            bodyPayload = {
                model: modelVariant,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxLength,
                temperature: temperature
            };
            break;
            
        case MODEL_NAME_GEMINI:
            // Add API key as param in URL for Gemini instead of Authorization header
            delete headers['Authorization'];
            // Append API key to URL
            apiConfig.url = `${apiConfig.url}?key=${apiKey.trim()}`;
            
            bodyPayload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: maxLength,
                    temperature: temperature
                }
            };
            break;
            
        case MODEL_NAME_CUSTOM:
            // Use OpenAI-compatible format by default for custom endpoints
            bodyPayload = {
                model: modelVariant,
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxLength,
                temperature: temperature
            };
            
            // Apply any custom configurations if available
            if (customConfig.requestFormat) {
                try {
                    // 尝试应用自定义请求格式
                    const customPayload = JSON.parse(customConfig.requestFormat);
                    // 替换占位符
                    const stringified = JSON.stringify(customPayload)
                        .replace(/"__PROMPT__"/g, JSON.stringify(prompt))
                        .replace(/"__MODEL__"/g, JSON.stringify(modelVariant))
                        .replace(/"__TEMPERATURE__"/g, temperature)
                        .replace(/"__MAX_TOKENS__"/g, maxLength);
                    bodyPayload = JSON.parse(stringified);
                } catch (e) {
                    console.error("Error applying custom request format:", e);
                    // 如果自定义格式有问题，回退到默认格式
                }
            }
            break;
            
        default:
            return { error: true, message: `不支持的模型类型: ${currentModel}。`, debug: 'Unsupported model type' };
    }

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

        // Extract optimized text based on model type
        switch(currentModel) {
            case MODEL_NAME_GROK:
                if (responseData.choices && responseData.choices[0]?.message?.content) {
                    optimizedText = responseData.choices[0].message.content.trim();
                    debug = 'Success (Grok - choices[0].message.content)';
                } else if (responseData.choices && responseData.choices[0]?.text) {
                    optimizedText = responseData.choices[0].text.trim();
                    debug = 'Success (Grok - choices[0].text)';
                }
                break;
                
            case MODEL_NAME_CLAUDE:
                if (responseData.content && responseData.content[0]?.text) {
                    optimizedText = responseData.content[0].text.trim();
                    debug = 'Success (Claude - content[0].text)';
                }
                break;
                
            case MODEL_NAME_GEMINI:
                if (responseData.candidates && responseData.candidates[0]?.content?.parts) {
                    const parts = responseData.candidates[0].content.parts;
                    const texts = parts.map(part => part.text || '').filter(Boolean);
                    optimizedText = texts.join(' ').trim();
                    debug = 'Success (Gemini - candidates[0].content.parts)';
                }
                break;
                
            case MODEL_NAME_CUSTOM:
                // 首先尝试OpenAI格式
                if (responseData.choices && responseData.choices[0]?.message?.content) {
                    optimizedText = responseData.choices[0].message.content.trim();
                    debug = 'Success (Custom - OpenAI format)';
                } 
                // 然后尝试提取自定义路径
                else if (customConfig.responsePath) {
                    try {
                        // 尝试根据用户配置的路径提取文本
                        const path = customConfig.responsePath.split('.');
                        let result = responseData;
                        for (const key of path) {
                            if (result && typeof result === 'object') {
                                result = result[key];
                            } else {
                                result = null;
                                break;
                            }
                        }
                        if (result && typeof result === 'string') {
                            optimizedText = result.trim();
                            debug = `Success (Custom - path: ${customConfig.responsePath})`;
                        }
                    } catch (e) {
                        console.error("Error extracting custom response path:", e);
                    }
                }
                // 最后尝试一些常见路径
                if (!optimizedText) {
                    // 可能的路径列表
                    const possiblePaths = [
                        // 通用格式
                        data => data.text,
                        data => data.content,
                        data => data.result,
                        data => data.response,
                        data => data.output,
                        data => data.generated_text,
                        // 嵌套格式
                        data => data.choices?.[0]?.text,
                        data => data.choices?.[0]?.message?.content,
                        data => data.results?.[0]?.content,
                        data => data.results?.[0]?.text,
                        data => data.generations?.[0]?.text
                    ];
                    
                    for (const pathFn of possiblePaths) {
                        try {
                            const result = pathFn(responseData);
                            if (result && typeof result === 'string') {
                                optimizedText = result.trim();
                                debug = `Success (Custom - auto path detection)`;
                                break;
                            }
                        } catch (e) {
                            // 忽略路径错误，继续尝试
                        }
                    }
                }
                break;
                
            default:
                throw new Error(`不支持的模型类型: ${currentModel}`);
        }

        if (!optimizedText) {
            console.warn('API response successful, but no optimized text found in expected fields.');
            console.log('Full response:', JSON.stringify(responseData));
            throw new Error('未能从API响应中提取优化后的文本。请检查您的API响应格式配置。');
        }

        const result = { optimizedText, debug };
        responseCache.set(cacheKey, { response: result, timestamp: Date.now() });
        return result;

    } catch (parseError) {
        console.error('Error parsing API response:', parseError);
        const result = { error: true, message: '解析API响应失败: ' + parseError.message, debug: `JSON parse error: ${parseError.message}` };
        return result;
    }
}


/**
 * Tests the API connection for the specified model.
 * Relies on background script's fetch logic.
 * @param {string} modelType - The model type (e.g., 'grok', 'claude', 'gemini', 'custom').
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
     const customConfig = settingsData[STORAGE_KEYS.CUSTOM_CONFIG] || {};

     const apiConfig = getApiConfig(userSettings, modelType);

     if (!apiConfig || !apiKey) {
         return { success: false, error: !apiKey ? 'API密钥未配置。' : 'API配置不正确。' };
     }

     const headers = {
         ...apiConfig.headers,
         'Authorization': `Bearer ${apiKey.trim()}`
     };

     const testMessage = testText || '这是一个API连接测试。';
     
     // 准备请求负载，根据不同模型类型
     let bodyPayload;
     let url = apiConfig.url;
     
     switch(modelType) {
         case MODEL_NAME_GROK:
             bodyPayload = {
                 model: effectiveModelName,
                 messages: [{ role: "user", content: testMessage }],
                 max_tokens: 50, // Keep test response short
                 temperature: 0.7
             };
             break;
             
         case MODEL_NAME_CLAUDE:
             bodyPayload = {
                 model: effectiveModelName,
                 messages: [{ role: "user", content: testMessage }],
                 max_tokens: 50,
                 temperature: 0.7
             };
             break;
             
         case MODEL_NAME_GEMINI:
             // 移除Authorization头，改用URL参数
             delete headers['Authorization'];
             url = `${apiConfig.url}?key=${apiKey.trim()}`;
             
             bodyPayload = {
                 contents: [{ role: "user", parts: [{ text: testMessage }] }],
                 generationConfig: {
                     maxOutputTokens: 50,
                     temperature: 0.7
                 }
             };
             break;
             
         case MODEL_NAME_CUSTOM:
             // 默认使用OpenAI兼容格式
             bodyPayload = {
                 model: effectiveModelName,
                 messages: [{ role: "user", content: testMessage }],
                 max_tokens: 50,
                 temperature: 0.7
             };
             
             // 应用自定义请求格式（如果有）
             if (customConfig.requestFormat) {
                 try {
                     const customPayload = JSON.parse(customConfig.requestFormat);
                     const stringified = JSON.stringify(customPayload)
                         .replace(/"__PROMPT__"/g, JSON.stringify(testMessage))
                         .replace(/"__MODEL__"/g, JSON.stringify(effectiveModelName))
                         .replace(/"__TEMPERATURE__"/g, 0.7)
                         .replace(/"__MAX_TOKENS__"/g, 50);
                     bodyPayload = JSON.parse(stringified);
                 } catch (e) {
                     console.error("Error applying custom test request format:", e);
                 }
             }
             break;
             
         default:
             return { success: false, error: `不支持的模型类型: ${modelType}` };
     }

     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT); // Use same timeout

     try {
         console.log(`Sending test request to ${url} with model ${effectiveModelName}`);
         const response = await fetch(url, {
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

         // Try to extract a meaningful response part based on model type
         let responseText = '';
         
         switch(modelType) {
             case MODEL_NAME_GROK:
                 if (data.choices && data.choices[0]?.message?.content) {
                     responseText = data.choices[0].message.content.trim();
                 } else if (data.choices && data.choices[0]?.text) {
                     responseText = data.choices[0].text.trim();
                 } else if (data.id) {
                     responseText = `连接成功，收到响应 ID: ${data.id}`;
                 }
                 break;
                 
             case MODEL_NAME_CLAUDE:
                 if (data.content && data.content[0]?.text) {
                     responseText = data.content[0].text.trim();
                 } else if (data.id) {
                     responseText = `连接成功，收到响应 ID: ${data.id}`;
                 }
                 break;
                 
             case MODEL_NAME_GEMINI:
                 if (data.candidates && data.candidates[0]?.content?.parts) {
                     const parts = data.candidates[0].content.parts;
                     const texts = parts.map(part => part.text || '').filter(Boolean);
                     responseText = texts.join(' ').trim();
                 } else if (data.promptFeedback) {
                     responseText = `连接成功，收到提示反馈。`;
                 }
                 break;
                 
             case MODEL_NAME_CUSTOM:
                 // 尝试不同路径
                 if (customConfig.responsePath) {
                     try {
                         const path = customConfig.responsePath.split('.');
                         let result = data;
                         for (const key of path) {
                             result = result[key];
                         }
                         if (result && typeof result === 'string') {
                             responseText = result.trim();
                         }
                     } catch (e) {
                         console.error("Error extracting custom test response:", e);
                     }
                 }
                 
                 // 如果自定义路径没有结果，尝试通用格式
                 if (!responseText) {
                     // 尝试OpenAI格式
                     if (data.choices && data.choices[0]?.message?.content) {
                         responseText = data.choices[0].message.content.trim();
                     } 
                     // 尝试其他常见格式
                     else if (data.text) {
                         responseText = data.text.trim();
                     } else if (data.content) {
                         responseText = typeof data.content === 'string' ? data.content.trim() : 'API响应成功';
                     } else if (data.result) {
                         responseText = typeof data.result === 'string' ? data.result.trim() : 'API响应成功';
                     } else if (data.id) {
                         responseText = `连接成功，收到响应 ID: ${data.id}`;
                     }
                 }
                 break;
         }
         
         // 如果找不到响应文本，提供通用成功消息
         if (!responseText) {
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
                buttonVisibility: 'focus', // 默认为仅在输入框聚焦/悬停时显示
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