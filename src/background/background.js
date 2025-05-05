// AI 模型配置
const MODEL_NAME = 'grok';

// API 配置
const API_CONFIGS = {
    grok: {
        url: 'https://api.x.ai/v1/chat/completions',  // 使用X.AI的API端点
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: 'Grok',
        defaultModel: 'grok-3-beta',
        supportedModels: [
            'grok-3.5',
            'grok-3-beta',
            'grok-3-mini-beta',
            'grok-3-mini-fast-beta',
            'grok-2',
            'grok-1.5'
        ]
    },
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        headers: {
            'Content-Type': 'application/json'
        },
        displayName: 'Gemini',
        defaultModel: 'gemini-pro'
    }
};

// 默认提示词模板
const DEFAULT_PROMPT_TEMPLATE = '{text}，请用更专业的语言重新组织这段文字，使其更清晰、更有说服力，同时保持原意。';

// 从存储中加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['apiKeys', 'settings', 'modelVariant']);
        console.log('加载设置:', result);
        return result;
    } catch (error) {
        console.error('加载设置失败:', error);
        return { apiKeys: {}, settings: {}, modelVariant: '' };
    }
}

// 初始化设置
loadSettings().then(() => {
    console.log('设置已初始化');
});

// 获取提示词
function getPrompt(text, promptTemplate) {
    // 如果没有提供模板，使用默认模板
    if (!promptTemplate) {
        promptTemplate = DEFAULT_PROMPT_TEMPLATE;
    }
    
    // 替换模板中的占位符
    return promptTemplate.replace('{text}', text);
}

// 生成一个模拟的优化文本 - 基于原文内容进行实际优化
function generateOptimizedText(originalText) {
    // 如果原文为空或太短，返回提示
    if (!originalText || originalText.length < 5) {
        return "请输入足够的文本内容进行优化";
    }
    // 不返回固定优化内容，提示用户配置API Key
    return "未检测到可用的AI服务，请在设置中配置API Key以获得真实AI优化结果。";
}

// 转换Gemini请求格式
function formatGeminiRequest(prompt, maxTokens = 1000, temperature = 0.7) {
    return {
        contents: [
            {
                parts: [
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: temperature
        }
    };
}

// 从Gemini响应中提取文本
function extractGeminiResponse(data) {
    if (data && data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            return candidate.content.parts[0].text || '';
        }
    }
    return '';
}

// 获取API配置，可能包含用户自定义设置
function getApiConfig(userSettings = {}, modelType = 'grok') {
    // 获取基础配置
    const baseConfig = API_CONFIGS[modelType] || API_CONFIGS.grok;
    let config = { ...baseConfig };
    
    // 如果用户设置中有自定义API配置，使用用户配置
    if (userSettings && userSettings.apiConfig && userSettings.apiConfig[modelType]) {
        const customConfig = userSettings.apiConfig[modelType];
        
        // 更新URL (如果提供)
        if (customConfig.url) {
            config.url = customConfig.url;
        }
        
        // 存储模型版本信息
        if (customConfig.model) {
            config.model = customConfig.model;
        }
    }
    
    return config;
}

// 添加响应缓存
const responseCache = new Map();

// 缓存有效期（毫秒）
const CACHE_TTL = 60 * 60 * 1000; // 1小时

// 清理过期缓存
function cleanExpiredCache() {
    const now = Date.now();
    for (const [key, data] of responseCache.entries()) {
        if (now - data.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

// 每10分钟清理一次缓存
setInterval(cleanExpiredCache, 10 * 60 * 1000);

// 计算缓存键
function getCacheKey(text, modelVariant, temperature) {
    // 使用完整文本作为缓存键的一部分
    return `${text}|${modelVariant}|${temperature}`;
}

// 处理文本优化请求
async function optimizeText(text) {
    console.log('收到优化请求, 文本长度:', text.length);
    
    try {
        const settings = await loadSettings();
        const apiKeys = settings.apiKeys || {};
        const userSettings = settings.settings || {};
        const currentModel = settings.currentModel || 'grok';
        const modelVariant = settings.modelVariant || '';
        const temperature = userSettings.temperature || 0.7;
        
        // 生成提示词用于日志记录和缓存键
        const prompt = getPrompt(text, userSettings.promptTemplate);
        
        // 检查缓存中是否有响应
        const cacheKey = getCacheKey(prompt, modelVariant, temperature);
        if (responseCache.has(cacheKey)) {
            const cachedData = responseCache.get(cacheKey);
            console.log('使用缓存的响应');
            return cachedData.response;
        }

        // 获取API配置和key
        const apiConfig = getApiConfig(userSettings, currentModel);
        const apiKey = apiKeys && apiKeys[currentModel];
        let optimizedText = '';
        let debug = '';
        
        if (apiConfig && apiKey) {
            try {
                // 构造精简的headers
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': currentModel === 'gemini' ? `Bearer ${apiKey.trim()}` : `Bearer ${apiKey.trim()}`
                };
                
                // 根据模型类型创建请求体
                let bodyPayload;
                if (currentModel === 'gemini') {
                    bodyPayload = formatGeminiRequest(prompt, userSettings.maxLength || 1000, temperature);
                } else {
                    // 默认使用Grok格式
                    bodyPayload = {
                        model: modelVariant || apiConfig.defaultModel,
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: userSettings.maxLength || 1000,
                        temperature: temperature
                    };
                }
                
                // 使用AbortController设置请求超时
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
                
                try {
                    const response = await fetch(apiConfig.url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(bodyPayload),
                        signal: controller.signal,
                        // 添加性能优化选项
                        cache: 'no-cache',
                        redirect: 'follow',
                        referrerPolicy: 'no-referrer',
                        keepalive: true,  // 维持连接以避免重复建立连接的开销
                        priority: 'high'  // 指示浏览器优先处理该请求
                    });
                    
                    // 清除超时
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP error ${response.status}: ${errorText}`);
                    }
                    
                    const data = await response.json();
                    
                    // 提取优化后的文本，根据不同模型处理
                    if (currentModel === 'gemini') {
                        optimizedText = extractGeminiResponse(data);
                        debug = 'Gemini API调用成功';
                    } else {
                        // Grok模型响应处理
                        if (data.optimizedText) {
                            optimizedText = data.optimizedText;
                            debug = 'AI接口调用成功(optimizedText)';
                        } else if (data.choices && data.choices[0]) {
                            // OpenAI/Grok 风格响应
                            if (data.choices[0].message && data.choices[0].message.content) {
                                optimizedText = data.choices[0].message.content;
                                debug = 'AI接口调用成功(choices[0].message.content)';
                            } else if (data.choices[0].text) {
                                optimizedText = data.choices[0].text;
                                debug = 'AI接口调用成功(choices[0].text)';
                            }
                        } else if (data.text) {
                            // 简单文本返回
                            optimizedText = data.text;
                            debug = 'AI接口调用成功(text)';
                        }
                    }
                    
                    if (!optimizedText) {
                        throw new Error('AI接口未返回优化文本');
                    }
                    
                    // 存储响应到缓存
                    const result = { optimizedText, debug };
                    responseCache.set(cacheKey, {
                        response: result,
                        timestamp: Date.now()
                    });
                    
                    return result;
                } catch (fetchError) {
                    // 清除超时
                    clearTimeout(timeoutId);
                    
                    // 处理超时错误
                    if (fetchError.name === 'AbortError') {
                        throw new Error('API请求超时，请稍后重试');
                    }
                    
                    // 处理其他错误
                    throw fetchError;
                }
            } catch (apiError) {
                let errorMsg = "AI服务不可用，请稍后重试。";
                
                if (apiError && apiError.message) {
                    errorMsg += " 错误信息: " + apiError.message;
                }
                
                return { 
                    optimizedText: errorMsg,
                    debug: 'API调用过程中出错'
                };
            }
        } else {
            console.warn('未配置API Key或API信息，使用本地模拟');
            optimizedText = generateOptimizedText(text);
            debug = '无API Key，未返回AI结果';
        }

        const result = { optimizedText, debug };
        
        // 即使是模拟结果也缓存起来
        responseCache.set(cacheKey, {
            response: result,
            timestamp: Date.now()
        });
        
        return result;
    } catch (error) {
        console.error('文本优化处理出错:', error);
        return { error: error.message || '未知错误' };
    }
}

// 测试API连接
async function testApiConnection(text, modelType, modelName) {
    // 如果未指定模型类型，则使用当前设置的模型
    if (!modelType) {
        const { currentModel } = await chrome.storage.sync.get('currentModel');
        modelType = currentModel || 'grok';
    }
    
    console.log(`测试${modelType}模型API连接, 版本: ${modelName || '默认'}`);
    
    try {
        // 获取配置
        const settings = await loadSettings();
        const apiKeys = settings.apiKeys || {};
        const userSettings = settings.settings || {};
        const modelVariant = modelName || settings.modelVariant || '';
        
        console.log('测试连接使用的配置:', {
            modelType,
            modelVariant,
            hasApiKey: !!apiKeys[modelType],
            apiKeyLength: apiKeys[modelType] ? apiKeys[modelType].length : 0,
            settings: userSettings
        });
        
        // 获取API配置和密钥
        const apiConfig = getApiConfig(userSettings, modelType);
        const apiKey = apiKeys && apiKeys[modelType];
        
        console.log('API配置:', apiConfig);
        
        // 验证API密钥
        if (!apiConfig || !apiKey) {
            return { 
                success: false, 
                error: !apiKey ? 'API密钥未配置' : 'API配置不正确' 
            };
        }
        
        // 构造请求头和URL
        const headers = { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`
        };
        
        // 构造测试消息
        const testMessage = text || '这是一个API连接测试。如果您看到此消息，说明API连接成功!';
        
        // 根据模型类型构造不同的请求体
        let bodyPayload;
        if (modelType === 'gemini') {
            bodyPayload = formatGeminiRequest(testMessage, 100, 0.7);
        } else {
            // Grok模型
            bodyPayload = {
                model: modelVariant || apiConfig.defaultModel,
                messages: [{ role: "user", content: testMessage }],
                max_tokens: 100,
                temperature: 0.7
            };
        }
        
        // 输出请求信息以便调试
        console.log('测试API请求详情:', {
            url: apiConfig.url,
            method: 'POST',
            headers: Object.keys(headers),
            modelType,
            bodyPayload
        });
        
        // 发送请求
        console.log('发送测试请求到:', apiConfig.url);
        const response = await fetch(apiConfig.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload)
        });
        
        // 检查响应
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API测试失败:', response.status, errorText);
            try {
                // 尝试解析错误响应为JSON
                const errorJson = JSON.parse(errorText);
                console.error('错误详情:', errorJson);
                if (errorJson.error) {
                    return {
                        success: false,
                        error: `HTTP error ${response.status}: ${errorJson.error.message || errorJson.error || errorText}`
                    };
                }
            } catch (parseError) {
                console.error('解析错误响应失败', parseError);
            }
            return { 
                success: false, 
                error: `HTTP error ${response.status}: ${errorText}` 
            };
        }
        
        // 解析响应
        const data = await response.json();
        console.log('API测试响应:', data);
        
        // 提取响应文本，根据模型类型处理
        let responseText = '';
        
        if (modelType === 'gemini') {
            responseText = extractGeminiResponse(data);
        } else {
            // Grok模型响应处理
            // 检查标准格式
            if (data.choices && data.choices[0]) {
                if (data.choices[0].message && data.choices[0].message.content) {
                    responseText = data.choices[0].message.content;
                } else if (data.choices[0].text) {
                    responseText = data.choices[0].text;
                }
            }
            
            // 检查简单文本格式
            if (!responseText && data.text) {
                responseText = data.text;
            }
        }
        
        // 如果仍然没有找到响应文本，但API调用成功
        if (!responseText) {
            // 尝试提取API返回的模型信息
            const modelInfo = data.model || modelVariant || apiConfig.defaultModel;
            return { 
                success: true, 
                message: `API连接成功! 模型: ${modelInfo}. 调用ID: ${data.id || '未知'}`
            };
        }
        
        return { 
            success: true, 
            message: responseText.substring(0, 100) + (responseText.length > 100 ? '...' : '')
        };
    } catch (error) {
        console.error('API测试出错:', error);
        return { 
            success: false, 
            error: error.message || '未知错误' 
        };
    }
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 处理ping消息，用于检查扩展连接状态
    if (request.action === 'ping') {
        sendResponse({ status: 'ok' });
        return true;
    }
    
    if (request.action === 'optimizeText') {
        optimizeText(request.text)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                console.error('处理优化请求出错:', error);
                sendResponse({ error: error.message || '未知错误' });
            });
        return true; // 表明我们将异步发送响应
    }
    
    if (request.action === 'testApiConnection') {
        console.log('处理API连接测试请求');
        testApiConnection(request.text, request.model, request.modelName)
            .then(result => {
                console.log('API测试结果:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('API测试出错:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message || '未知错误' 
                });
            });
        return true; // 表明我们将异步发送响应
    }
    
    // 处理切换模型请求
    if (request.action === 'switchModel') {
        console.log('切换模型至:', request.model);
        if (request.model) {
            chrome.storage.sync.set({ currentModel: request.model, modelVariant: request.model === 'grok' ? 'grok-3-beta' : 'gemini-pro' })
                .then(() => {
                    console.log('模型切换成功');
                    sendResponse({ success: true });
                })
                .catch(error => {
                    console.error('模型切换失败:', error);
                    sendResponse({ success: false, error: error.message });
                });
            // 清空缓存，因为模型已切换
            responseCache.clear();
            return true; // 表明我们将异步发送响应
        }
        sendResponse({ success: false, error: '未提供有效的模型名称' });
        return true;
    }
});

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
    console.log('扩展安装/更新:', details.reason);
    
    if (details.reason === 'install') {
        console.log('初始化默认设置');
        // 初始化存储默认设置
        chrome.storage.sync.set({
            currentModel: MODEL_NAME,
            apiKeys: {},
            settings: {
                autoOptimize: false,
                optimizeDelay: 1000,
                maxLength: 1000,
                temperature: 0.7,
                promptTemplate: DEFAULT_PROMPT_TEMPLATE,
                showButton: true,
                buttonPosition: 'right'
            }
        }).then(() => {
            console.log('默认设置初始化完成');
        }).catch(error => {
            console.error('默认设置初始化失败:', error);
        });
    }
});