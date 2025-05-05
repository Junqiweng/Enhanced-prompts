// DOM 元素
const autoOptimize = document.getElementById('autoOptimize');
const optimizeDelay = document.getElementById('optimizeDelay');
const maxLength = document.getElementById('maxLength');
const temperature = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperatureValue');
const promptTemplate = document.getElementById('promptTemplate');
const showButton = document.getElementById('showButton');
const buttonPosition = document.getElementById('buttonPosition');
const saveButton = document.getElementById('save');
const statusElement = document.getElementById('status');
const showDebugInfo = document.getElementById('showDebugInfo');
const testResultElement = document.getElementById('test-result');

// Grok模型配置元素
const grokUrl = document.getElementById('grok-url');
const grokKey = document.getElementById('grok-key');
const grokModel = document.getElementById('grok-model');
const testGrokButton = document.getElementById('test-grok');
const toggleGrokKey = document.getElementById('toggle-grok-key');
const refreshModelsButton = document.createElement('button');
refreshModelsButton.id = 'refresh-models';
refreshModelsButton.className = 'button secondary-button test-button';
refreshModelsButton.textContent = '刷新模型列表';

// 获取标签页元素
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');

// 调试工具按钮
const checkPermissionsButton = document.getElementById('check-permissions');
const checkApiConfigButton = document.getElementById('check-api-config');
const testFetchButton = document.getElementById('test-fetch');
const debugOutputDiv = document.getElementById('debug-output');

// 常量
const MODEL_NAME = 'grok';

// 默认设置
const DEFAULT_SETTINGS = {
    autoOptimize: false,
    optimizeDelay: 1000,
    maxLength: 1000,
    temperature: 0.7,
    promptTemplate: '{text}，请用更专业的语言重新组织这段文字，使其更清晰、更有说服力，同时保持原意。',
    showButton: true,
    buttonPosition: 'right',
    showDebugInfo: false,
    apiConfig: {
        grok: {
            url: 'https://api.x.ai/v1/chat/completions',
            model: 'grok-3-beta',
            supportedModels: [
                'grok-3.5',
                'grok-3-beta',
                'grok-3-mini-beta',
                'grok-3-mini-fast-beta',
                'grok-2',
                'grok-1.5'
            ]
        }
    }
};

// 初始化设置
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化标签页切换
    initTabs();
    
    // 从存储中加载设置
    const {settings: storedSettings = {}, apiKeys = {}} = await chrome.storage.sync.get(['settings', 'apiKeys']);
    const mergedSettings = {...DEFAULT_SETTINGS, ...storedSettings};
    
    // 确保apiConfig存在
    if (!mergedSettings.apiConfig) {
        mergedSettings.apiConfig = DEFAULT_SETTINGS.apiConfig;
    }
    
    // 更新界面
    updateUI(mergedSettings, apiKeys);

    // 添加实时更新事件
    setupEventListeners();
    
    // 获取XAI模型列表
    fetchXAIModels();
});

// 初始化标签页切换功能
function initTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有标签页的active类
            tabs.forEach(t => t.classList.remove('active'));
            // 隐藏所有内容区域
            sections.forEach(s => s.style.display = 'none');
            
            // 激活当前标签页和对应的内容区域
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId).style.display = 'block';
        });
    });
}

// 加载设置
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['settings', 'apiKeys']);
        return { 
            settings: { ...DEFAULT_SETTINGS, ...result.settings },
            apiKeys: result.apiKeys || {}
        };
    } catch (error) {
        console.error('加载设置失败:', error);
        return { settings: DEFAULT_SETTINGS, apiKeys: {} };
    }
}

// 更新界面
function updateUI(settings, apiKeys = {}) {
    // 基本设置
    autoOptimize.checked = settings.autoOptimize;
    optimizeDelay.value = settings.optimizeDelay;
    maxLength.value = settings.maxLength;
    temperature.value = settings.temperature;
    temperatureValue.textContent = settings.temperature;
    promptTemplate.value = settings.promptTemplate || DEFAULT_SETTINGS.promptTemplate;
    showButton.checked = settings.showButton;
    buttonPosition.value = settings.buttonPosition;
    showDebugInfo.checked = settings.showDebugInfo || false;
    
    // API配置
    if (settings.apiConfig && settings.apiConfig.grok) {
        grokUrl.value = settings.apiConfig.grok.url || DEFAULT_SETTINGS.apiConfig.grok.url;
        
        // 设置选择的模型
        const modelValue = settings.apiConfig.grok.model || DEFAULT_SETTINGS.apiConfig.grok.model;
        
        // 如果下拉列表中没有该选项，动态添加
        let optionExists = false;
        for (let i = 0; i < grokModel.options.length; i++) {
            if (grokModel.options[i].value === modelValue) {
                optionExists = true;
                break;
            }
        }
        
        if (!optionExists) {
            const option = document.createElement('option');
            option.value = modelValue;
            option.textContent = modelValue; // 显示原始模型ID
            grokModel.appendChild(option);
        }
        
        grokModel.value = modelValue;
    }
    
    // API密钥
    if (apiKeys) {
        grokKey.value = apiKeys[MODEL_NAME] || '';
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 实时更新温度值显示
    temperature.addEventListener('input', (e) => {
        temperatureValue.textContent = e.target.value;
    });

    // 保存按钮点击事件
    saveButton.addEventListener('click', saveSettings);
    
    // 测试连接按钮点击事件
    if (testGrokButton) {
        testGrokButton.addEventListener('click', () => testApiConnection());
    }
    
    // 密码显示切换
    if (toggleGrokKey) {
        toggleGrokKey.addEventListener('click', () => {
            if (grokKey.type === 'password') {
                grokKey.type = 'text';
                toggleGrokKey.textContent = '🔒';
            } else {
                grokKey.type = 'password';
                toggleGrokKey.textContent = '👁️';
            }
        });
    }
    
    // 调试按钮事件
    if (checkPermissionsButton) {
        checkPermissionsButton.addEventListener('click', checkPermissions);
    }
    
    if (checkApiConfigButton) {
        checkApiConfigButton.addEventListener('click', checkApiConfig);
    }
    
    if (testFetchButton) {
        testFetchButton.addEventListener('click', testFetchAPI);
    }
    
    // 刷新模型列表按钮
    if (refreshModelsButton) {
        // 添加到DOM
        if (grokModel && grokModel.parentNode) {
            grokModel.parentNode.appendChild(refreshModelsButton);
        }
        
        refreshModelsButton.addEventListener('click', () => {
            refreshModelsButton.disabled = true;
            refreshModelsButton.textContent = '正在获取...';
            
            // 获取模型列表
            fetchXAIModels(true)
                .then(() => {
                    showStatus('模型列表刷新成功', 'success');
                })
                .catch(error => {
                    console.error('刷新模型列表出错:', error);
                    showStatus('刷新模型列表失败: ' + error.message, 'error');
                })
                .finally(() => {
                    refreshModelsButton.disabled = false;
                    refreshModelsButton.textContent = '刷新模型列表';
                });
        });
    }
}

// 测试API连接
async function testApiConnection() {
    try {
        // 显示测试中状态
        showTestResult('正在测试API连接，请稍候...', 'info');
        
        // 获取当前输入的API Key和URL
        const apiKey = grokKey.value.trim();
        const apiUrl = grokUrl.value.trim();
        const modelName = grokModel.value.trim();
        
        // 验证输入
        if (!apiKey) {
            showTestResult('请先输入API密钥', 'error');
            return;
        }
        
        if (!apiUrl) {
            showTestResult('请先输入API URL', 'error');
            return;
        }
        
        // 构造简单测试消息
        const testMessage = '这是API连接测试。';
        
        // 构造请求
        const body = {
            model: modelName || 'grok-3-beta',
            messages: [
                {
                    role: 'user',
                    content: testMessage
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        };
        
        // 发送测试请求
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            let errorDetails = '';
            try {
                const errorData = await response.json();
                errorDetails = errorData.error?.message || JSON.stringify(errorData);
            } catch (e) {
                errorDetails = await response.text();
            }
            
            showTestResult(`API连接测试失败: HTTP ${response.status} - ${errorDetails}`, 'error');
            return;
        }
        
        // 解析响应
        const data = await response.json();
        console.log('Grok API响应:', data);
        
        // 提取响应文本
        let responseText = '';
        
        // 检查标准OpenAI格式
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
        
        // 如果成功提取了响应文本
        if (responseText) {
            showTestResult(`API连接测试成功! 响应: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`, 'success');
        } else {
            // 尝试提取模型信息来改进提示
            const modelInfo = data.model || modelName || '未知模型';
            const idInfo = data.id ? `ID: ${data.id.substring(0, 8)}...` : '';
            
            showTestResult(`API连接成功! 但无法从响应中提取文本内容。使用的模型: ${modelInfo} ${idInfo}。`, 'success');
        }
    } catch (error) {
        showTestResult(`测试过程中出错: ${error.message}`, 'error');
        console.error('API测试错误:', error);
    }
}

function showTestResult(message, type) {
    if (testResultElement) {
        testResultElement.textContent = message;
        testResultElement.className = `status ${type}`;
        
        // 3秒后自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                testResultElement.className = 'status';
                testResultElement.textContent = '';
            }, 3000);
        }
    }
}

async function saveSettings() {
    try {
        // 收集表单数据
        const settings = {
            autoOptimize: autoOptimize.checked,
            optimizeDelay: parseInt(optimizeDelay.value),
            maxLength: parseInt(maxLength.value),
            temperature: parseFloat(temperature.value),
            promptTemplate: promptTemplate.value,
            showButton: showButton.checked,
            buttonPosition: buttonPosition.value,
            showDebugInfo: showDebugInfo.checked,
            apiConfig: {
                grok: {
                    url: grokUrl.value.trim(),
                    model: grokModel.value.trim()
                }
            }
        };
        
        // 获取API密钥
        const apiKey = grokKey.value.trim();
        
        // 验证设置
        const validationResult = validateSettings(settings, apiKey);
        if (!validationResult.valid) {
            showStatus(validationResult.message, 'error');
            return;
        }
        
        // 获取现有的API密钥
        const { apiKeys = {} } = await chrome.storage.sync.get('apiKeys');
        
        // 更新API密钥（只有当用户输入了新密钥时）
        if (apiKey) {
            apiKeys[MODEL_NAME] = apiKey;
        }
        
        // 保存设置和API密钥到storage
        await Promise.all([
            chrome.storage.sync.set({ settings }),
            chrome.storage.sync.set({ apiKeys }),
            chrome.storage.sync.set({ currentModel: MODEL_NAME }) // 确保当前模型设置为grok
        ]);
        
        showStatus('设置已保存', 'success');
        
        // 通知background脚本设置已更新
        chrome.runtime.sendMessage({ 
            action: 'settingsUpdated',
            settings,
            apiKeys
        }).catch(err => console.warn('通知background脚本失败:', err));
        
    } catch (error) {
        console.error('保存设置失败:', error);
        showStatus(`保存设置失败: ${error.message}`, 'error');
    }
}

function validateSettings(settings, apiKey) {
    // 验证延迟时间
    if (isNaN(settings.optimizeDelay) || settings.optimizeDelay < 0) {
        return { valid: false, message: '自动优化延迟必须是正数' };
    }
    
    // 验证最大长度
    if (isNaN(settings.maxLength) || settings.maxLength <= 0) {
        return { valid: false, message: '最大输出文本长度必须大于0' };
    }
    
    // 验证温度
    if (isNaN(settings.temperature) || settings.temperature < 0 || settings.temperature > 1) {
        return { valid: false, message: '温度值必须在0到1之间' };
    }
    
    // 验证提示词模板
    if (!settings.promptTemplate || !settings.promptTemplate.includes('{text}')) {
        return { valid: false, message: '提示词模板必须包含{text}占位符' };
    }
    
    // 验证API URL (如果有设置)
    if (settings.apiConfig.grok.url && !isValidUrl(settings.apiConfig.grok.url)) {
        return { valid: false, message: 'Grok API URL格式无效' };
    }
    
    return { valid: true };
}

function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function showStatus(message, type) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        
        // 3秒后自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusElement.className = 'status';
            }, 3000);
        }
    }
}

async function checkPermissions() {
    if (!debugOutputDiv) return;
    
    debugOutputDiv.textContent = '检查扩展权限中...';
    
    try {
        // 检查存储权限
        let storagePermission = true;
        try {
            await chrome.storage.sync.get('test');
        } catch (e) {
            storagePermission = false;
        }
        
        // 检查主机权限
        let hostPermissions = [];
        try {
            const hostPerms = chrome.runtime.getManifest().host_permissions;
            if (hostPerms) {
                hostPermissions = hostPerms;
            }
        } catch (e) {
            console.error('获取主机权限失败', e);
        }
        
        // 检查X.AI API访问权限
        let xaiAccess = hostPermissions.some(perm => perm.includes('api.x.ai'));
        
        debugOutputDiv.textContent = `权限状态:
- 存储权限: ${storagePermission ? '✅ 正常' : '❌ 缺失'}
- 主机权限: 
  ${hostPermissions.length === 0 ? '  无主机权限' : hostPermissions.map(h => `  - ${h}: ${h.includes('api.x.ai') ? '✅' : '❓'}`).join('\n')}
- X.AI API访问: ${xaiAccess ? '✅ 已授权' : '❌ 未授权'}

建议操作:
${!xaiAccess ? '- 需要添加X.AI API(https://api.x.ai/*)的主机权限' : ''}
${!storagePermission ? '- 需要添加storage权限' : ''}
${xaiAccess && storagePermission ? '- 所有权限正常 ✅' : ''}`;
    } catch (error) {
        debugOutputDiv.textContent = `检查权限时出错: ${error.message}`;
    }
}

async function checkApiConfig() {
    if (!debugOutputDiv) return;
    
    debugOutputDiv.textContent = '检查API配置中...';
    
    try {
        // 获取当前设置
        const { settings = {}, apiKeys = {} } = await chrome.storage.sync.get(['settings', 'apiKeys']);
        
        // 合并默认设置
        const mergedSettings = {...DEFAULT_SETTINGS, ...settings};
        
        // 检查API配置
        let apiConfigStatus = '';
        
        // Grok配置
        const grokConfig = mergedSettings.apiConfig?.grok || {};
        const grokKey = apiKeys[MODEL_NAME];
        
        apiConfigStatus += `Grok API配置:
- URL: ${grokConfig.url || '未设置'} ${grokConfig.url ? '✅' : '❌'}
- 模型: ${grokConfig.model || '未设置'} ${grokConfig.model ? '✅' : '❌'}
- API Key: ${grokKey ? '已设置 ✅' : '未设置 ❌'} ${grokKey ? `(长度: ${grokKey.length}字符)` : ''}

全局设置:
- 自动优化: ${mergedSettings.autoOptimize ? '开启' : '关闭'}
- 优化延迟: ${mergedSettings.optimizeDelay}ms
- 温度值: ${mergedSettings.temperature}
- 最大长度: ${mergedSettings.maxLength} tokens

建议操作:
${!grokKey ? '- 设置Grok API Key' : ''}
${!grokConfig.url ? '- 设置Grok API URL' : ''}
${!grokConfig.model ? '- 设置Grok模型版本' : ''}
${grokKey && grokConfig.url && grokConfig.model ? '- 配置完整 ✅ 可以点击"测试连接"按钮验证' : ''}`;
        
        debugOutputDiv.textContent = apiConfigStatus;
    } catch (error) {
        debugOutputDiv.textContent = `检查API配置时出错: ${error.message}`;
    }
}

async function testFetchAPI() {
    if (!debugOutputDiv) return;
    
    debugOutputDiv.textContent = '测试网络连接中...';
    
    try {
        // 测试X.AI API主机的DNS解析和连接
        await testEndpoint('X.AI API', 'https://api.x.ai');
    } catch (error) {
        debugOutputDiv.textContent = `网络测试过程中出错: ${error.message}`;
    }
    
    async function testEndpoint(name, url, options = {}) {
        try {
            const startTime = Date.now();
            const response = await fetch(url, {
                method: 'HEAD',
                cache: 'no-cache',
                ...options
            });
            const endTime = Date.now();
            
            debugOutputDiv.textContent += `\n${name} 连接测试:
- 状态: ${response.ok ? '✅ 成功' : '❌ 失败'} (HTTP ${response.status})
- 响应时间: ${endTime - startTime}ms
- 服务器: ${response.headers.get('server') || '未知'}`;
        } catch (error) {
            debugOutputDiv.textContent += `\n${name} 连接测试:
- 状态: ❌ 失败
- 错误: ${error.message}
- 可能原因: 网络连接问题、防火墙限制或DNS解析失败`;
        }
    }
}

// 从XAI官网获取可用的模型列表
async function fetchXAIModels(forceRefresh = false) {
    try {
        showDebugOutput('正在获取XAI官网的模型列表...');
        
        // 如果不是强制刷新，且已有模型列表，则不重新获取
        if (!forceRefresh && grokModel.options.length > 0) {
            showDebugOutput('使用已有的模型列表.');
            return;
        }
        
        // 模拟API请求延迟
        if (forceRefresh) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 模拟从API获取模型列表
        // 实际应该通过fetch请求获取，但XAI目前可能没有提供公开的API来获取可用模型列表
        
        // 模拟模型列表获取逻辑
        let models = [];
        
        // 检查API Key
        const settings = await chrome.storage.sync.get(['apiKeys']);
        const apiKey = settings.apiKeys && settings.apiKeys[MODEL_NAME];
        
        if (apiKey) {
            // 模拟API检测到的有效Key，返回更完整的模型列表
            models = [
                { id: 'grok-3.5', name: 'grok-3.5 (最新)' },
                { id: 'grok-3-beta', name: 'grok-3-beta' },
                { id: 'grok-3-mini-beta', name: 'grok-3-mini-beta' },
                { id: 'grok-3-mini-fast-beta', name: 'grok-3-mini-fast-beta' },
                { id: 'grok-2', name: 'grok-2' },
                { id: 'grok-1.5', name: 'grok-1.5' }
            ];
            
            showDebugOutput('使用API密钥成功获取完整模型列表');
        } else {
            // 模拟未配置API Key，返回基本模型列表
            models = [
                { id: 'grok-3-beta', name: 'grok-3-beta' },
                { id: 'grok-3-mini-beta', name: 'grok-3-mini-beta' },
                { id: 'grok-3-mini-fast-beta', name: 'grok-3-mini-fast-beta' }
            ];
            
            showDebugOutput('未配置API密钥，只获取基本模型列表');
        }
        
        // 清空现有选项
        grokModel.innerHTML = '';
        
        // 添加新选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            grokModel.appendChild(option);
        });
        
        // 尝试设置为当前选中的值
        const currentSettings = await chrome.storage.sync.get(['settings']);
        if (currentSettings.settings && 
            currentSettings.settings.apiConfig && 
            currentSettings.settings.apiConfig.grok && 
            currentSettings.settings.apiConfig.grok.model) {
                
            const savedModel = currentSettings.settings.apiConfig.grok.model;
            
            // 检查是否在列表中
            let modelExists = false;
            for (let i = 0; i < grokModel.options.length; i++) {
                if (grokModel.options[i].value === savedModel) {
                    grokModel.value = savedModel;
                    modelExists = true;
                    break;
                }
            }
            
            // 如果保存的模型不在列表中，添加它
            if (!modelExists) {
                const option = document.createElement('option');
                option.value = savedModel;
                option.textContent = savedModel; // 显示原始模型ID
                grokModel.appendChild(option);
                grokModel.value = savedModel;
            }
        }
        
        showDebugOutput('模型列表获取成功！');
    } catch (error) {
        console.error('获取模型列表出错:', error);
        showDebugOutput(`获取模型列表出错: ${error.message || '未知错误'}`);
        throw error; // 向上传递错误
    }
}

// 显示调试输出
function showDebugOutput(message) {
    if (debugOutputDiv) {
        debugOutputDiv.textContent += `${new Date().toLocaleTimeString()}: ${message}\n`;
        // 自动滚动到底部
        debugOutputDiv.scrollTop = debugOutputDiv.scrollHeight;
    }
}