/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {function} func - The function to debounce.
 * @param {number} wait - The debounce delay in milliseconds.
 * @param {boolean} immediate - Fire immediately on the leading edge.
 * @returns {function} The debounced function.
 */
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};


// Simple in-memory cache for recent optimization results (client-side)
class TextCache {
    constructor(maxSize = 30) { // Increased size slightly
        this.cache = new Map();
        this.maxSize = maxSize;
        this.keys = []; // Keep track of insertion order for eviction
    }

    get(key) {
        return this.cache.get(key);
    }

    has(key) {
        return this.cache.has(key);
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.keys.shift(); // Get the oldest key
            this.cache.delete(oldestKey);
            console.log('Cache limit reached, evicted:', oldestKey);
        }
        this.cache.set(key, value);
        this.keys.push(key); // Add new key to the end
    }

    clear() {
        this.cache.clear();
        this.keys = [];
        console.log('Client-side cache cleared.');
    }
}

// Main class for detecting inputs and managing optimization buttons
class InputDetector {
    constructor() {
        this.observedInputs = new Set(); // Use Set so we can iterate when needed
        this.inputButtonMap = new Map(); // Map input element to button and updater
        this.textCache = new TextCache();
        this.mutationObserver = null;
        this.debouncedUpdatePosition = null; // To store debounced function instance
        this.settings = {
            showButton: true,
            buttonVisibility: 'focus',
            toggleShortcut: 'Alt+O', // 默认为 Alt+O
        };
        this.lastFocusedInput = null;
        this.init();
        console.log('AI Text Optimizer: Input Detector initialized.');
    }

    init() {
        // 先加载设置
        chrome.storage.sync.get(['settings'], (result) => {
            const opts = result.settings || {};
            this.settings.showButton = opts.showButton ?? true;
            this.settings.buttonVisibility = opts.buttonVisibility ?? 'focus';
            this.settings.toggleShortcut = opts.toggleShortcut || 'Alt+O';
            console.log('Loaded settings:', this.settings);

            this.initMutationObserver();
            this.addExistingInputs();

            // 注册全局快捷键监听
            window.addEventListener('keydown', this.handleShortcut.bind(this));
        });

        // 监听设置更新消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'settingsUpdated') {
                console.log('Settings updated signal received in content script, clearing client cache.');
                this.textCache.clear();
                chrome.storage.sync.get(['settings'], (result) => {
                    const opts = result.settings || {};
                    this.settings.showButton = opts.showButton ?? true;
                    this.settings.buttonVisibility = opts.buttonVisibility ?? 'focus';
                    this.settings.toggleShortcut = opts.toggleShortcut || 'Alt+O';
                    console.log('Updated settings:', this.settings);

                    // 清除旧按钮元素
                    document.querySelectorAll('.ai-text-optimizer-button').forEach(btn => btn.remove());
                    // 重置输入标记
                    document.querySelectorAll('[data-ai-optimizer-attached]').forEach(el => delete el.dataset.aiOptimizerAttached);
                    this.observedInputs.clear();
                    this.inputButtonMap.clear();
                    this.addExistingInputs();
                });
                sendResponse({ success: true });
            }
            return true;
        });
    }

    // Initialize MutationObserver to watch for new inputs added to the DOM
    initMutationObserver() {
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    this.processNewNodes(mutation.addedNodes);
                }
                // Optionally, handle attribute changes if needed (e.g., contenteditable toggled)
                // if (mutation.type === 'attributes' && mutation.attributeName === 'contenteditable') { ... }
            });
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false // Set to true if watching attribute changes like contenteditable
        });
    }

    // Process nodes added to the DOM
    processNewNodes(nodes) {
        nodes.forEach(node => {
            // Check if the node itself is an input or contains inputs
            if (node.nodeType === Node.ELEMENT_NODE) {
                 if (this.isTargetInput(node)) {
                     this.attachInputHandler(node);
                 } else if (node.querySelectorAll) { // Check if querySelectorAll exists ( robustness)
                    const inputs = node.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
                    inputs.forEach(input => this.attachInputHandler(input));
                 }
            }
        });
    }

    // Check if an element is a target input field
    isTargetInput(element) {
        const tagName = element.tagName.toLowerCase();
        return (
            (tagName === 'input' && element.type === 'text') ||
            tagName === 'textarea' ||
            element.isContentEditable // Checks contenteditable="true"
        );
    }

    // Check existing inputs when the script loads
    addExistingInputs() {
        const inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
        inputs.forEach(input => this.attachInputHandler(input));
        console.log(`Found ${inputs.length} existing input fields.`);
    }

    // 处理自定义快捷键 (仅在 hidden 模式下)
    handleShortcut(event) {
        if (this.settings.buttonVisibility !== 'hidden') return;
        const combo = this.settings.toggleShortcut.split('+').map(s => s.trim().toLowerCase());
        const key = event.key.toLowerCase();
        const modifiers = {
            alt: event.altKey,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            meta: event.metaKey,
        };
        // 判断快捷键匹配
        let mainKey = null;
        const expected = { alt: false, ctrl: false, shift: false, meta: false };
        combo.forEach(part => {
            if (['alt','ctrl','shift','meta'].includes(part)) expected[part] = true;
            else mainKey = part;
        });
        if (mainKey !== key) return;
        if (expected.alt !== modifiers.alt || expected.ctrl !== modifiers.ctrl || expected.shift !== modifiers.shift || expected.meta !== modifiers.meta) return;
        // 匹配成功，触发按钮显示/隐藏
        let input = document.activeElement;
        let info = this.inputButtonMap.get(input);
        // 如果当前焦点不是输入框或未绑定按钮，尝试使用上次聚焦的输入框
        if (!info && this.lastFocusedInput) {
            input = this.lastFocusedInput;
            info = this.inputButtonMap.get(input);
        }
        if (info) {
            const { button, updater } = info;
            if (button.style.display === 'flex') {
                button.style.display = 'none';
            } else {
                button.style.display = 'flex';
                updater();
            }
            event.preventDefault();
        }
    }

    // Attach the optimizer button and event listeners to an input field
    attachInputHandler(input) {
        if (this.observedInputs.has(input) || input.dataset.aiOptimizerAttached) return;
        this.observedInputs.add(input);
        input.dataset.aiOptimizerAttached = 'true';
        // 记录最后聚焦的输入框
        input.addEventListener('focus', () => { this.lastFocusedInput = input; });

        if (!this.settings.showButton) return;
        const optimizeButton = this.createOptimizeButton();
        document.body.appendChild(optimizeButton);

        const updatePosition = this.createPositionUpdater(input, optimizeButton);
        const debounced = debounce(updatePosition, 150);
        this.inputButtonMap.set(input, { button: optimizeButton, updater: debounced });

        // 根据可见性设置处理按钮的初始显示状态和事件监听
        if (this.settings.buttonVisibility === 'hidden') {
            // 完全隐藏模式 - 按钮始终保持隐藏
            optimizeButton.style.display = 'none';
            
            // 仍然需要位置更新事件以防通过其他方式激活按钮
            window.addEventListener('scroll', debounced, { passive: true });
            window.addEventListener('resize', debounced);
            
        } else if (this.settings.buttonVisibility === 'always') {
            // 始终可见模式 - 按钮一直显示，样式更低调
            optimizeButton.style.display = 'flex';
            optimizeButton.classList.add('ai-text-optimizer-button-subtle');
            
            // 无需隐藏按钮，仅添加位置更新监听器
            window.addEventListener('scroll', debounced, { passive: true });
            window.addEventListener('resize', debounced);
            
            // 立即更新按钮位置
            updatePosition();
            
        } else if (this.settings.buttonVisibility === 'focus') {
            // 聚焦/悬停模式 - 仅在输入框聚焦或悬停时显示按钮
            optimizeButton.style.display = 'none'; // 初始隐藏
            
            // 定义显示按钮的函数
            const showButton = () => {
                if (document.body.contains(input)) {
                    optimizeButton.style.display = 'flex';
                    updatePosition();
                } else {
                    this.cleanupInputHandler(input, optimizeButton, debounced);
                }
            };
            
            // 定义隐藏按钮的函数
            const hideButton = () => {
                setTimeout(() => {
                    if (!optimizeButton.matches(':hover')) {
                        optimizeButton.style.display = 'none';
                    }
                }, 250);
            };
            
            // 添加输入框事件监听器
            input.addEventListener('focus', showButton);
            input.addEventListener('input', showButton);
            input.addEventListener('blur', hideButton);
            
            // 添加按钮事件监听器
            optimizeButton.addEventListener('mouseenter', () => clearTimeout(hideButton));
            optimizeButton.addEventListener('mouseleave', hideButton);
            
            // 添加滚动和调整大小的事件监听器
            window.addEventListener('scroll', debounced, { passive: true });
            window.addEventListener('resize', debounced);
        }

        // Reset state on manual input
        const resetOptimizeState = () => {
            input.dataset.originalText = this.getInputText(input); // Update original text on change
            optimizeButton.disabled = false;
            optimizeButton.innerHTML = '优化文本'; // Reset text
            
            // 重置按钮样式，并根据设置添加低调样式
            optimizeButton.className = 'ai-text-optimizer-button'; // Reset class
            if (this.settings.buttonVisibility === 'always') {
                optimizeButton.classList.add('ai-text-optimizer-button-subtle');
            }
        };
        input.addEventListener('input', debounce(resetOptimizeState, 300)); // Debounce reset slightly

        // Button click handler
        optimizeButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const textToOptimize = this.getInputText(input); // Get current text
            const originalForCache = input.dataset.originalText || textToOptimize; // Use original if available for cache consistency

            if (!textToOptimize || textToOptimize.trim().length < 5) {
                 this.showButtonStatus(optimizeButton, '无内容', 'error', '请输入至少5个字符');
                 return;
            }

            // -- Start Optimization --
            optimizeButton.disabled = true;
            optimizeButton.innerHTML = '优化中...';
            optimizeButton.className = 'ai-text-optimizer-button'; // Reset class before adding new state

            // Check client-side cache first (using original text as key)
            const cacheKey = originalForCache;
             if (this.textCache.has(cacheKey)) {
                 const cachedResult = this.textCache.get(cacheKey);
                 console.log('Using client-side cache:', cachedResult);
                 // Check if cached result itself was an error
                 if (!cachedResult.error) {
                     this.setInputText(input, cachedResult.optimizedText);
                     this.showButtonStatus(optimizeButton, '优化成功', 'success');
                     return; // Exit after using cache
                 } else {
                      console.log('Cached item was an error, proceeding to API call.');
                 }
             }

            // Send to background script for API call
            try {
                const result = await chrome.runtime.sendMessage({
                    action: 'optimizeText',
                    text: textToOptimize
                });

                console.log('Optimization result from background:', result);

                if (result && result.error) {
                    // Handle errors reported by background script
                    this.showButtonStatus(optimizeButton, '优化失败', 'error', result.message);
                    // Cache the error state if desired (or not, to allow retries)
                    // this.textCache.set(cacheKey, { error: true, message: result.message });
                } else if (result && result.optimizedText) {
                    // Success
                    this.setInputText(input, result.optimizedText);
                    // Cache the successful result
                    this.textCache.set(cacheKey, { optimizedText: result.optimizedText });
                     this.showButtonStatus(optimizeButton, '优化成功', 'success');
                } else {
                    // Unexpected response
                    console.error('Invalid response structure received:', result);
                    this.showButtonStatus(optimizeButton, '响应无效', 'error', '从后台收到的响应格式不正确。');
                }

            } catch (error) {
                console.error('Error sending message to background or processing result:', error);
                let message = '与后台脚本通信失败。';
                if (error.message?.includes('Extension context invalidated')) {
                    message = '扩展已失效，请刷新页面。';
                     // Optionally disable the button permanently or show a persistent error
                } else if (error.message) {
                    message += ` (${error.message})`;
                }
                this.showButtonStatus(optimizeButton, '通信错误', 'error', message);
            } finally {
                // Re-enable button after a short delay (allowing status message to be seen)
                 // The showButtonStatus function handles the timed reset now
                // setTimeout(() => { optimizeButton.disabled = false; }, 2000); // Removed, handled by showButtonStatus
            }
        });
    }

    // Create the optimizer button element
    createOptimizeButton() {
        const button = document.createElement('button');
        button.className = 'ai-text-optimizer-button';
        button.innerHTML = '优化文本'; // Set initial text
        
        // 初始状态下根据可见性设置按钮样式
        if (this.settings.buttonVisibility === 'always') {
            button.classList.add('ai-text-optimizer-button-subtle');
            button.style.display = 'flex';
        } else {
            button.style.display = 'none'; // hidden或focus模式初始隐藏
        }
        
        button.type = 'button'; // Prevent form submission
        return button;
    }

    // Creates the function responsible for updating the button's position
    createPositionUpdater(input, button) {
        return () => {
            // Check if both elements are still in the DOM
            if (!document.body.contains(input) || !document.body.contains(button)) {
                return; // Don't try to update position if elements are gone
            }
            try {
                const rect = input.getBoundingClientRect();
                 // Position relative to viewport
                button.style.position = 'fixed';
                // Center vertically, place to the right with padding
                button.style.top = `${rect.top + window.scrollY + (rect.height / 2) - (button.offsetHeight / 2)}px`;
                button.style.left = `${rect.left + window.scrollX + rect.width + 8}px`; // 8px gap
                button.style.zIndex = '99999'; // Ensure high z-index
            } catch (e) {
                console.error("Error calculating button position:", e);
                 // Hide button if positioning fails?
                 button.style.display = 'none';
            }
        };
    }

     // Show status on the button itself and reset after a delay
     showButtonStatus(button, text, statusType = 'info', alertMessage = null) {
         // Ensure button exists
         if (!button || !document.body.contains(button)) return;

         const originalText = '优化文本';
         button.innerHTML = text;
         button.classList.remove('ai-text-optimizer-button-success', 'ai-text-optimizer-button-error'); // Clear previous states

         if (statusType === 'success') {
             button.classList.add('ai-text-optimizer-button-success');
         } else if (statusType === 'error') {
             button.classList.add('ai-text-optimizer-button-error');
             if (alertMessage) {
                 // Use a less intrusive notification method if possible, alert can be annoying
                  console.warn('Optimization Alert:', alertMessage); // Log warning
                 // Consider creating a custom tooltip/toast notification instead of alert
                 // For now, using alert as per original code, but recommend changing
                 // alert(`优化失败: ${alertMessage}`); // Uncomment if alert is desired
             }
         }

         // Reset button state after a delay
         setTimeout(() => {
             // Check if button still exists before resetting
             if (document.body.contains(button)) {
                 button.innerHTML = originalText;
                 button.classList.remove('ai-text-optimizer-button-success', 'ai-text-optimizer-button-error');
                 button.disabled = false; // Re-enable after status display
                 
                 // 恢复始终可见模式的低调样式
                 if (this.settings.buttonVisibility === 'always') {
                     button.classList.add('ai-text-optimizer-button-subtle');
                 }
             }
         }, 2500); // 2.5 seconds visibility for status
     }


    // Get text from different input types
    getInputText(input) {
        if (!input) return '';
        if (input.isContentEditable) {
            return input.textContent || '';
        }
        return input.value || '';
    }

    // Set text for different input types, attempting to trigger necessary events
    setInputText(input, text) {
        if (!input) return;

        const currentText = this.getInputText(input);
        if (currentText === text) {
            console.log("Text is the same, skipping update.");
            return; // Don't update if text hasn't changed
        }

        console.log(`Setting text for ${input.tagName}: "${text.substring(0, 50)}..."`);

        try {
             if (input.tagName.toLowerCase() === 'textarea' || input.tagName.toLowerCase() === 'input') {
                 input.value = text;
             } else if (input.isContentEditable) {
                 input.textContent = text;
             } else {
                 // Fallback for unknown types (less reliable)
                 if ('value' in input) input.value = text;
                 else if ('textContent' in input) input.textContent = text;
                 else input.innerHTML = text; // Least preferred
             }

             // Trigger events to notify the page/frameworks of the change
             input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
             input.dispatchEvent(new Event('change', { bubbles: true, cancelable: false })); // Change event often follows input

             // For contenteditable, focus/blur might be needed sometimes
             if (input.isContentEditable) {
                 input.focus();
                 // Move cursor to end (optional, might be desired UX)
                  const range = document.createRange();
                  const sel = window.getSelection();
                  range.selectNodeContents(input);
                  range.collapse(false); // false collapses to the end
                  sel.removeAllRanges();
                  sel.addRange(range);
                // input.blur(); // Blur immediately after focus? Might not be needed.
             }

             // Verify if the value was set (useful for debugging complex inputs)
             // setTimeout(() => {
             //      if (this.getInputText(input) !== text) {
             //           console.warn("Input value may not have been set correctly for:", input);
             //      }
             // }, 50); // Check shortly after

        } catch (error) {
            console.error(`Failed to set text for input (${input.tagName}):`, error);
             // Optionally try innerHTML as a last resort if direct setting failed
             try {
                 input.innerHTML = text;
                 input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
             } catch (innerError) {
                  console.error("Setting innerHTML also failed:", innerError);
             }
        }
    }

     // Cleanup listeners and button if the input is removed
     cleanupInputHandler(input, button, debouncedUpdater) {
         console.log('Cleaning up optimizer for removed input:', input);
         if (button && button.parentNode) {
             button.parentNode.removeChild(button);
         }
          window.removeEventListener('scroll', debouncedUpdater);
          window.removeEventListener('resize', debouncedUpdater);
          // Input listeners are usually cleaned up automatically when the element is removed,
          // but explicit removal can be added if needed (e.g., if using anonymous functions was avoided).
          // We used WeakSet for observedInputs, so no manual removal needed there.
     }


    // Disconnect the observer when the script is unloaded (though content scripts usually run until page unload)
    disconnect() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            console.log('MutationObserver disconnected.');
        }
    }
}

// --- Connection Status Check ---

// Stores the ID of the interval timer
let connectionCheckIntervalId = null;
let lastPingTime = 0;
const PING_INTERVAL = 3 * 60 * 1000; // Check every 3 minutes
const PING_TIMEOUT = 5000; // 5 seconds for ping response

async function checkExtensionConnection() {
    // Avoid pinging too frequently
    if (Date.now() - lastPingTime < PING_INTERVAL / 2) {
        return;
    }

    console.log('Checking extension connection...');
    lastPingTime = Date.now();

    try {
        // Check if runtime is available (basic check for context invalidation)
        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            console.error('Extension context seems invalidated (chrome.runtime missing).');
            showExtensionError('AI文本优化器连接中断，请刷新页面。');
            if (connectionCheckIntervalId) clearInterval(connectionCheckIntervalId); // Stop checking
            return;
        }

         // Use a timeout for the ping message
         const responsePromise = chrome.runtime.sendMessage({ action: 'ping' });
         const timeoutPromise = new Promise((_, reject) =>
             setTimeout(() => reject(new Error('Ping timed out')), PING_TIMEOUT)
         );

         const response = await Promise.race([responsePromise, timeoutPromise]);


        // If we get here, sendMessage didn't throw immediately and didn't timeout
        if (chrome.runtime.lastError) {
            // This catches errors like "Receiving end does not exist" if background is inactive
            console.error('Extension connection error (runtime.lastError):', chrome.runtime.lastError.message);
            showExtensionError(`连接错误: ${chrome.runtime.lastError.message}`);
             // Consider stopping checks if error is persistent
             // if (chrome.runtime.lastError.message.includes("Could not establish connection")) {
             //     if (connectionCheckIntervalId) clearInterval(connectionCheckIntervalId);
             // }
        } else if (response && response.status === 'ok') {
            console.log('Extension connection OK (pong received).');
            // Optionally remove error message if shown previously
             removeExtensionError();
        } else {
             // Got a response, but not what we expected
             console.warn('Unexpected ping response:', response);
             showExtensionError('收到无效的连接响应。');
        }

    } catch (error) {
        // Catches errors from sendMessage itself (e.g., if context is truly gone) or the timeout
        console.error('Failed to check extension connection:', error);
         if (error.message === 'Ping timed out') {
             showExtensionError('连接后台超时，请稍后重试。');
         } else if (error.message.includes('Extension context invalidated')) {
            showExtensionError('AI文本优化器连接中断，请刷新页面。');
             if (connectionCheckIntervalId) clearInterval(connectionCheckIntervalId); // Stop checking
         } else {
             showExtensionError(`检查连接失败: ${error.message}`);
         }
    }
}

// --- UI Error Display ---

const ERROR_DIV_ID = 'ai-text-optimizer-error-div';

function showExtensionError(message) {
    try {
        let errorDiv = document.getElementById(ERROR_DIV_ID);
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = ERROR_DIV_ID;
            errorDiv.className = 'ai-text-optimizer-error-popup'; // Use a specific class for styling
            // Apply basic styles directly for robustness if CSS fails
            Object.assign(errorDiv.style, {
                position: 'fixed',
                top: '10px',
                right: '10px',
                backgroundColor: '#FFD2D2', // Light red
                color: '#D93025', // Darker red text
                padding: '10px 15px',
                borderRadius: '5px',
                zIndex: '100000', // Very high z-index
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            });
             document.body.appendChild(errorDiv);
        }

        // Update message and add close button if it doesn't exist
        if (!errorDiv.querySelector('.close-btn')) {
            errorDiv.innerHTML = `<span>${message}</span>`; // Use innerHTML to reset content
            const closeButton = document.createElement('span');
            closeButton.textContent = '×';
            closeButton.className = 'close-btn';
            Object.assign(closeButton.style, {
                 cursor: 'pointer',
                 fontWeight: 'bold',
                 fontSize: '16px',
                 marginLeft: 'auto', // Push to the right
                 paddingLeft: '10px'
            });
            closeButton.onclick = () => removeExtensionError(); // Use onclick for simplicity here
            errorDiv.appendChild(closeButton);
        } else {
             // Update message if div already exists
             errorDiv.querySelector('span:first-child').textContent = message;
        }

        errorDiv.style.display = 'flex'; // Ensure visible

        // Auto-remove after a longer period for errors
        setTimeout(removeExtensionError, 8000); // 8 seconds

    } catch (e) {
        console.error('Failed to show extension error:', e);
    }
}

function removeExtensionError() {
    const errorDiv = document.getElementById(ERROR_DIV_ID);
    if (errorDiv) {
        errorDiv.style.display = 'none'; // Hide instead of removing to reuse the element
    }
}

// --- Initial Execution ---

// Check connection when page becomes visible
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('Page visible, checking connection (debounced).');
        // Debounce this check slightly
        debounce(checkExtensionConnection, 500)();
    }
});

// Check connection on load
window.addEventListener('load', () => {
    console.log('Page loaded, checking connection.');
    // Delay initial check slightly to allow background script to potentially initialize
    setTimeout(checkExtensionConnection, 1500);
    // Start periodic checks
    if (!connectionCheckIntervalId) {
        connectionCheckIntervalId = setInterval(checkExtensionConnection, PING_INTERVAL);
    }
});

// Instantiate the detector
const detector = new InputDetector();

// Optional: Add a listener for when the script/extension is unloaded/disabled
// window.addEventListener('unload', () => {
//     if (detector) detector.disconnect();
//     if (connectionCheckIntervalId) clearInterval(connectionCheckIntervalId);
// });