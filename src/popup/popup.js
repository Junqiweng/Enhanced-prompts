// DOM 元素
const statusMessage = document.getElementById('status-message');
const optionsButton = document.getElementById('options-button');
const testConnectionButton = document.getElementById('test-connection');
const debugContent = document.getElementById('debug-content');
const modelStatus = document.getElementById('model-status');

// 常量
const MODEL_NAME = 'grok';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log("弹窗已加载");
    
    // 加载设置和检查API状态
    initializePopup();
    
    // 设置事件监听器
    optionsButton.addEventListener('click', openOptions);
    testConnectionButton.addEventListener('click', handleTestConnection);
});

// 初始化弹出窗口
async function initializePopup() {
    try {
        // 加载保存的设置
        const settings = await chrome.storage.sync.get(['apiKeys', 'settings']);
        const apiKey = settings.apiKeys && settings.apiKeys[MODEL_NAME];
        
        // 获取当前选择的模型名称
        let currentModel = MODEL_NAME;
        if (settings.settings && 
            settings.settings.apiConfig && 
            settings.settings.apiConfig.grok && 
            settings.settings.apiConfig.grok.model) {
            currentModel = settings.settings.apiConfig.grok.model;
        }
        
        // 设置模型状态指示器
        updateModelStatus(!!apiKey);
        
        // 显示版本信息
        debugContent.innerHTML = `
            <p>扩展版本: ${chrome.runtime.getManifest().version}</p>
            <p>当前模型: ${currentModel}</p>
            <p>配置状态: ${apiKey ? '已配置API密钥' : '未配置API密钥'}</p>
            <p>点击"测试连接"来验证API连接状态</p>
        `;
    } catch (error) {
        console.error("初始化加载设置错误:", error);
        showStatus("加载设置时出错", "error");
        debugContent.innerHTML = `
            <p style="color: red;">加载设置时出错:</p>
            <p>${error.message || '未知错误'}</p>
        `;
    }
}

// 更新模型状态指示器
function updateModelStatus(hasKey, isConnected = false) {
    if (!modelStatus) return;
    
    if (!hasKey) {
        modelStatus.textContent = '未配置';
        modelStatus.className = 'model-status disconnected';
    } else if (isConnected) {
        modelStatus.textContent = '已连接';
        modelStatus.className = 'model-status connected';
    } else {
        modelStatus.textContent = '待验证';
        modelStatus.className = 'model-status';
    }
}

// 打开选项页面
function openOptions() {
    console.log("打开高级设置页面");
    chrome.runtime.openOptionsPage();
}

// 处理测试API连接
async function handleTestConnection() {
    console.log("测试API连接");
    
    // 禁用按钮，避免重复点击
    testConnectionButton.disabled = true;
    showStatus("正在测试连接...", "info");
    
    try {
        // 获取当前选择的模型名称
        const settings = await chrome.storage.sync.get(['apiKeys', 'settings']);
        const apiKey = settings.apiKeys && settings.apiKeys[MODEL_NAME];
        
        let currentModel = MODEL_NAME;
        if (settings.settings && 
            settings.settings.apiConfig && 
            settings.settings.apiConfig.grok && 
            settings.settings.apiConfig.grok.model) {
            currentModel = settings.settings.apiConfig.grok.model;
        }
        
        debugContent.innerHTML = `<p>正在测试${currentModel}模型的API连接，请稍候...</p>`;
        
        // 检查是否已设置API Key
        if (!apiKey) {
            updateModelStatus(false);
            showStatus("未配置API密钥", "error");
            debugContent.innerHTML = `
                <p style="color: red;">未设置Grok的API密钥</p>
                <p>请在<a href="#" id="open-options">高级设置</a>中配置API密钥</p>
            `;
            addOptionsLinkListener();
            return;
        }
        
        // 执行API测试
        const result = await testApiConnection(currentModel);
        
        // 根据测试结果更新状态
        if (result && result.success) {
            updateModelStatus(true, true);
            showStatus("API连接测试成功", "success");
        } else {
            updateModelStatus(true, false);
            showStatus("API连接测试失败", "error");
        }
        
        // 显示详细结果
        displayTestResult(result);
    } catch (error) {
        console.error('API测试错误:', error);
        updateModelStatus(true, false);
        showStatus("API测试发生错误", "error");
        debugContent.innerHTML = `
            <p style="color: red;">API测试过程中发生错误:</p>
            <p>${error.message || '未知错误'}</p>
            <p>请按F12打开开发者工具，查看Console中的详细错误信息</p>
        `;
    } finally {
        // 恢复按钮状态
        testConnectionButton.disabled = false;
    }
}

// 添加选项链接监听器
function addOptionsLinkListener() {
    setTimeout(() => {
        const openOptionsLink = document.getElementById('open-options');
        if (openOptionsLink) {
            openOptionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                openOptions();
            });
        }
    }, 10);
}

// 显示测试结果
function displayTestResult(result) {
    if (result && result.success) {
        debugContent.innerHTML = `
            <p style="color: green;">API连接测试成功!</p>
            <p>响应: ${result.message.substring(0, 100)}${result.message.length > 100 ? '...' : ''}</p>
        `;
    } else if (result && result.error) {
        debugContent.innerHTML = `
            <p style="color: red;">API测试失败:</p>
            <p>${result.error}</p>
            <p>可能的原因:</p>
            <ul>
                <li>API密钥不正确或无效</li>
                <li>网络连接问题 (防火墙、代理)</li>
                <li>API服务暂时不可用 (限流、维护)</li>
                <li>主机权限未正确设置 (manifest.json)</li>
                <li>API URL 或模型名称配置错误</li>
            </ul>
            <p>请在<a href="#" id="open-options">高级设置</a>中检查配置</p>
        `;
        addOptionsLinkListener();
    } else {
        debugContent.innerHTML = `
            <p style="color: orange;">未收到有效响应或发生未知错误</p>
            <p>请在<a href="#" id="open-options">高级设置</a>中检查配置</p>
        `;
        addOptionsLinkListener();
    }
}

// 测试API连接
async function testApiConnection(modelName = MODEL_NAME) {
    try {
        console.log(`发送${modelName}模型的API测试请求`);
        
        // 发送测试请求
        return await chrome.runtime.sendMessage({
            action: 'testApiConnection',
            model: MODEL_NAME,
            modelName: modelName,
            text: '这是一个API连接测试，请确认API是否正常工作。'
        });
    } catch (error) {
        console.error('发送API测试请求出错:', error);
        throw error;
    }
}

// 显示状态消息
function showStatus(message, type = 'success') {
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        
        // 3秒后清除不是错误的消息
        if (type !== 'error') {
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status-message';
            }, 3000);
        }
    }
}