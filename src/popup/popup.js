// DOM Elements
const statusMessage = document.getElementById('status-message');
const optionsButton = document.getElementById('options-button');
const testConnectionButton = document.getElementById('test-connection');
const debugContent = document.getElementById('debug-content');
const modelStatus = document.getElementById('model-status');
const versionBadge = document.querySelector('.version-badge'); // Get version badge

// Constants (Should ideally match background/options)
const MODEL_NAME_GROK = 'grok';
const STORAGE_KEYS = {
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    MODEL_VARIANT: 'modelVariant',
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Popup loaded.");
    initializePopup();
    setupEventListeners();
});

async function initializePopup() {
    showStatus("正在加载...", "info"); // Initial loading state

    // Set version from manifest
    if (versionBadge) {
        try {
             versionBadge.textContent = `v${chrome.runtime.getManifest().version}`;
        } catch (e) {
             console.warn("Could not get manifest version.");
             versionBadge.textContent = 'v?.?.?';
        }
    }


    try {
        // Get necessary data from storage
        const data = await chrome.storage.sync.get([
            STORAGE_KEYS.API_KEYS,
            STORAGE_KEYS.MODEL_VARIANT,
            // Optionally get specific settings if needed by popup UI
            // STORAGE_KEYS.SETTINGS
        ]);

        const apiKeys = data[STORAGE_KEYS.API_KEYS] || {};
        const modelVariant = data[STORAGE_KEYS.MODEL_VARIANT] || '未设置'; // Get saved variant
        const hasApiKey = !!apiKeys[MODEL_NAME_GROK];

        // Update UI based on loaded data
        updateModelStatus(hasApiKey); // Initial status based on key presence

        debugContent.innerHTML = `
            <p>扩展版本: ${versionBadge?.textContent || '未知'}</p>
            <p>当前选用模型: ${modelVariant}</p>
            <p>API密钥状态: ${hasApiKey ? '<span style="color: green;">已配置</span>' : '<span style="color: orange;">未配置</span>'}</p>
            <p>点击 "测试连接" 验证与API的连通性。</p>
        `;

        hideStatus(); // Clear loading message

    } catch (error) {
        console.error("Popup initialization error:", error);
        showStatus("加载状态失败", "error");
        debugContent.innerHTML = `
            <p style="color: red;">加载扩展状态时出错:</p>
            <p>${error.message || '未知错误'}</p>
            <p>请尝试重新打开弹窗或检查浏览器控制台。</p>
        `;
        updateModelStatus(false); // Show disconnected on error
    }
}

function setupEventListeners() {
    if (optionsButton) {
        optionsButton.addEventListener('click', openOptionsPage);
    } else {
        console.error("Options button not found.");
    }

    if (testConnectionButton) {
        testConnectionButton.addEventListener('click', handleTestConnection);
    } else {
        console.error("Test connection button not found.");
    }

    // Add listener for clicks within debug content (e.g., for settings link)
    if (debugContent) {
         debugContent.addEventListener('click', (event) => {
             if (event.target.id === 'open-options-link') {
                 event.preventDefault();
                 openOptionsPage();
             }
         });
    }
}


// --- UI Update Functions ---

function updateModelStatus(hasKey, isConnected = null) {
    if (!modelStatus) return;

    if (!hasKey) {
        modelStatus.textContent = '未配置';
        modelStatus.className = 'model-status disconnected';
        modelStatus.title = '请在高级设置中配置API密钥';
    } else if (isConnected === true) {
        modelStatus.textContent = '已连接';
        modelStatus.className = 'model-status connected';
        modelStatus.title = 'API连接测试成功';
    } else if (isConnected === false) {
         modelStatus.textContent = '连接失败';
         modelStatus.className = 'model-status disconnected';
         modelStatus.title = 'API连接测试失败，请检查设置和网络';
    } else { // isConnected is null (initial state or test pending)
        modelStatus.textContent = '待验证';
        modelStatus.className = 'model-status'; // Default style
        modelStatus.title = 'API密钥已配置，点击“测试连接”进行验证';
    }
}

function showStatus(message, type = 'info') {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    // Ensure base class is present, then add type class
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = message ? 'block' : 'none'; // Show/hide based on message presence

    // Auto-clear non-error messages
    if (type !== 'error' && type !== 'warning') { // Keep warning visible too?
        setTimeout(hideStatus, 3000);
    }
}

function hideStatus() {
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message'; // Reset class
        statusMessage.style.display = 'none';
    }
}

// --- Actions ---

function openOptionsPage() {
    console.log("Opening options page...");
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        console.error("chrome.runtime.openOptionsPage is not available.");
        showStatus("无法打开设置页面", "error");
    }
}

async function handleTestConnection() {
    if (!testConnectionButton) return;

    testConnectionButton.disabled = true;
    testConnectionButton.textContent = '测试中...'; // Provide feedback on the button
    showStatus("正在发送测试请求...", "info");
    updateModelStatus(true, null); // Reset status to 'pending' visually if key exists
     debugContent.innerHTML = `<p>正在测试连接，请稍候...</p>`; // Update debug area

    try {
        // Get the currently selected model variant from storage to test accurately
        const data = await chrome.storage.sync.get([STORAGE_KEYS.MODEL_VARIANT, STORAGE_KEYS.API_KEYS]);
        const modelVariant = data[STORAGE_KEYS.MODEL_VARIANT]; // Use the saved variant
        const hasApiKey = !!(data[STORAGE_KEYS.API_KEYS]?.[MODEL_NAME_GROK]);

         if (!hasApiKey) {
              showStatus("未配置API密钥", "error");
              updateModelStatus(false);
              debugContent.innerHTML = `
                  <p style="color: orange;">未找到Grok API密钥。</p>
                  <p>请点击 <a href="#" id="open-options-link">高级设置</a> 进行配置。</p>
              `;
              // Note: Listener for open-options-link is added in setupEventListeners
              return; // Exit early
         }


        // Send message to background script to perform the test
        const result = await chrome.runtime.sendMessage({
            action: 'testApiConnection',
            model: MODEL_NAME_GROK, // Specify the model type being tested
            modelName: modelVariant // Pass the specific variant
            // text: Optional test text if needed
        });

        console.log("API Test Result received in popup:", result);

        // Update UI based on the result from background script
        if (result && result.success) {
            showStatus("API连接测试成功", "success");
            updateModelStatus(true, true); // Mark as connected
            debugContent.innerHTML = `
                <p style="color: green;">✅ 连接测试成功!</p>
                <p>模型响应: ${result.message ? escapeHtml(result.message.substring(0, 150)) + (result.message.length > 150 ? '...' : '') : '(无文本内容)'}</p>
            `;
        } else {
            const errorMessage = result?.error || '未知错误，请检查后台脚本日志。';
            showStatus("API连接测试失败", "error");
            updateModelStatus(true, false); // Mark as connection failed (key exists, but test failed)
            debugContent.innerHTML = `
                <p style="color: red;">❌ 连接测试失败:</p>
                <p>${escapeHtml(errorMessage)}</p>
                 <p>请检查:</p>
                 <ul>
                     <li>API密钥是否正确/有效</li>
                     <li>网络连接和防火墙设置</li>
                     <li>浏览器控制台中的详细错误</li>
                     <li><a href="#" id="open-options-link">高级设置</a> 中的URL和模型名称</li>
                 </ul>
            `;
        }

    } catch (error) {
        console.error("Error during test connection:", error);
        showStatus("测试请求失败", "error");
        updateModelStatus(true, false); // Assume connection failed if message send fails

        let detail = error.message || '未知通信错误。';
        if (error.message?.includes('Extension context invalidated')) {
             detail = '扩展连接已断开，请刷新页面。';
        } else if (error.message?.includes('Could not establish connection')) {
             detail = '无法连接到后台脚本，可能已被禁用或出错。';
        }
        debugContent.innerHTML = `
            <p style="color: red;">发送测试请求时出错:</p>
            <p>${escapeHtml(detail)}</p>
             <p>请检查浏览器控制台获取更多信息。</p>
        `;
    } finally {
        // Re-enable the button
        if (testConnectionButton) {
             testConnectionButton.disabled = false;
             testConnectionButton.textContent = '测试连接';
        }
    }
}

// Simple HTML escaping utility
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }