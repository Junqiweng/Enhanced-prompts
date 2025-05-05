// 添加文本缓存
class TextCache {
    constructor(maxSize = 20) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    
    get(key) {
        return this.cache.get(key);
    }
    
    has(key) {
        return this.cache.has(key);
    }
    
    set(key, value) {
        // 如果缓存已满，删除最早添加的项
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

// 输入框检测和处理逻辑
class InputDetector {
    constructor() {
        this.observedInputs = new Set();
        this.textCache = new TextCache(30); // 缓存最近30个请求结果
        this.initMutationObserver();
        this.addExistingInputs();
        console.log('AI文本优化器已初始化');
    }

    // 初始化 MutationObserver 来监听 DOM 变化
    initMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    this.processNewNodes(mutation.addedNodes);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 处理新添加的节点
    processNewNodes(nodes) {
        nodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                this.checkForInputs(node);
            }
        });
    }

    // 检查并处理输入框
    checkForInputs(element) {
        const inputs = element.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]');
        inputs.forEach(input => {
            if (!this.observedInputs.has(input)) {
                this.attachInputHandler(input);
                this.observedInputs.add(input);
            }
        });
    }

    // 处理页面加载时已存在的输入框
    addExistingInputs() {
        this.checkForInputs(document.body);
    }

    // 为输入框添加优化按钮和事件处理
    attachInputHandler(input) {
        // 创建优化按钮
        const optimizeButton = document.createElement('button');
        optimizeButton.className = 'ai-text-optimizer-button';
        optimizeButton.innerHTML = '优化文本';
        optimizeButton.style.display = 'none';

        // 只在页面初次加载时缓存原始内容
        if (!input.dataset.original) {
            input.dataset.original = this.getInputText(input);
        }
        input.dataset.optimized = 'false';

        // 设置按钮样式和位置
        this.setButtonPosition(input, optimizeButton);

        // 输入内容变更时，重置原文缓存和按钮状态
        const resetOptimizeState = () => {
            // 只有用户手动输入时才更新原文
            input.dataset.original = this.getInputText(input);
            input.dataset.optimized = 'false';
            optimizeButton.disabled = false;
            optimizeButton.innerHTML = '优化文本';
        };
        input.addEventListener('input', resetOptimizeState);
        input.addEventListener('change', resetOptimizeState);

        // 添加事件监听器
        input.addEventListener('focus', () => optimizeButton.style.display = 'block');
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (!optimizeButton.matches(':hover')) {
                    optimizeButton.style.display = 'none';
                }
            }, 200);
        });

        // 处理优化按钮点击事件
        optimizeButton.addEventListener('click', async (event) => {
            // 阻止事件冒泡和默认行为
            event.preventDefault();
            event.stopPropagation();

            const originalText = input.dataset.original || this.getInputText(input);

            if (originalText) {
                try {
                    optimizeButton.disabled = true;
                    optimizeButton.innerHTML = '优化中...';
                    // 移除可能的其他状态类
                    optimizeButton.classList.remove('ai-text-optimizer-button-success', 'ai-text-optimizer-button-error');

                    // 先检查本地缓存
                    const cacheKey = originalText; // 使用完整文本作为缓存键
                    if (this.textCache.has(cacheKey)) {
                        // 使用缓存的结果
                        const cachedResult = this.textCache.get(cacheKey);
                        this.setInputText(input, cachedResult);
                        input.dataset.optimized = 'true';
                        
                        // 更新UI状态
                        optimizeButton.classList.add('ai-text-optimizer-button-success');
                        optimizeButton.innerHTML = '优化成功';
                        
                        setTimeout(() => {
                            optimizeButton.classList.remove('ai-text-optimizer-button-success');
                            optimizeButton.innerHTML = '优化文本';
                            optimizeButton.disabled = false;
                        }, 1000);
                        
                        return;
                    }

                    // 发送消息给background script处理API请求
                    try {
                        const result = await chrome.runtime.sendMessage({
                            action: 'optimizeText',
                            text: originalText
                        });

                        if (result && result.optimizedText) {
                            // 添加到缓存
                            this.textCache.set(cacheKey, result.optimizedText);
                            
                            // 设置优化后的文本
                            this.setInputText(input, result.optimizedText);
                            input.dataset.optimized = 'true';
                            
                            // 添加成功状态样式
                            optimizeButton.classList.add('ai-text-optimizer-button-success');
                            optimizeButton.innerHTML = '优化成功';
                            
                            // 恢复原样式
                            setTimeout(() => {
                                optimizeButton.classList.remove('ai-text-optimizer-button-success');
                                optimizeButton.innerHTML = '优化文本';
                            }, 1000);
                        } else if (result && result.error) {
                            console.error('优化失败:', result.error);
                            
                            // 添加错误状态样式
                            optimizeButton.classList.add('ai-text-optimizer-button-error');
                            optimizeButton.innerHTML = '优化失败';
                            
                            // 2秒后恢复原样式和提示错误
                            setTimeout(() => {
                                optimizeButton.classList.remove('ai-text-optimizer-button-error');
                                optimizeButton.innerHTML = '优化文本';
                                alert(`优化失败: ${result.error}`);
                            }, 2000);
                        } else {
                            console.error('未收到有效的优化结果');
                            
                            // 添加错误状态样式
                            optimizeButton.classList.add('ai-text-optimizer-button-error');
                            optimizeButton.innerHTML = '未收到结果';
                            
                            // 2秒后恢复原样式和提示错误
                            setTimeout(() => {
                                optimizeButton.classList.remove('ai-text-optimizer-button-error');
                                optimizeButton.innerHTML = '优化文本';
                                alert('未收到有效的优化结果，请检查API设置');
                            }, 2000);
                        }
                    } catch (chromeError) {
                        console.error('Chrome runtime错误:', chromeError);
                        
                        // 添加错误状态样式
                        optimizeButton.classList.add('ai-text-optimizer-button-error');
                        optimizeButton.innerHTML = '连接错误';
                        
                        // 2秒后恢复原样式
                        setTimeout(() => {
                            optimizeButton.classList.remove('ai-text-optimizer-button-error');
                            optimizeButton.innerHTML = '优化文本';
                            
                            // 判断是否是上下文失效错误
                            if (chromeError.message && chromeError.message.includes('Extension context invalidated')) {
                                alert('扩展上下文已失效，请刷新页面后重试');
                            } else {
                                alert(`通信错误: ${chromeError.message || '未知错误'}`);
                            }
                        }, 2000);
                    }
                } catch (error) {
                    console.error('文本优化过程中出错:', error);
                    
                    // 添加错误状态样式
                    optimizeButton.classList.add('ai-text-optimizer-button-error');
                    optimizeButton.innerHTML = '处理错误';
                    
                    // 2秒后恢复原样式
                    setTimeout(() => {
                        optimizeButton.classList.remove('ai-text-optimizer-button-error');
                        optimizeButton.innerHTML = '优化文本';
                        alert(`优化失败: ${error.message || '未知错误'}`);
                    }, 2000);
                } finally {
                    // 仍然在finally解除禁用状态，但注意之前的setTimeout会覆盖内容
                    setTimeout(() => {
                        optimizeButton.disabled = false;
                    }, 2000);
                }
            } else {
                console.log('没有文本需要优化');
                
                // 添加错误状态样式
                optimizeButton.classList.add('ai-text-optimizer-button-error');
                optimizeButton.innerHTML = '无文本';
                
                // 2秒后恢复原样式
                setTimeout(() => {
                    optimizeButton.classList.remove('ai-text-optimizer-button-error');
                    optimizeButton.innerHTML = '优化文本';
                    alert('请先输入文本再进行优化');
                }, 2000);
            }
        });

        // 将按钮添加到页面
        document.body.appendChild(optimizeButton);
        console.log('优化按钮已添加到输入框');
    }

    // 设置优化按钮的位置
    setButtonPosition(input, button) {
        const updatePosition = () => {
            const rect = input.getBoundingClientRect();
            button.style.position = 'fixed';
            button.style.top = `${rect.top + rect.height/2 - button.offsetHeight/2}px`;
            button.style.left = `${rect.right + 10}px`;
        };

        // 初始定位
        updatePosition();

        // 监听滚动和调整大小事件来更新位置
        window.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);
    }

    // 获取输入框的文本内容
    getInputText(input) {
        return input.value || input.textContent || '';
    }

    // 设置输入框的文本内容
    setInputText(input, text) {
        // 确保文本真的有变化
        const originalText = this.getInputText(input);
        
        // 如果文本相同，强制添加空格再移除以触发变化
        if (originalText === text) {
            text = text + ' ';
        }
        
        // 判断输入类型并设置值
        try {
            if (input.tagName.toLowerCase() === 'textarea' || input.tagName.toLowerCase() === 'input') {
                // 输入框类型
                input.value = text;
                
                // 手动触发input事件，确保其他可能的事件监听器能感知到变化
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 检查值是否成功设置
                if (input.value !== text) {
                    // 尝试其他方法设置值
                    try {
                        input.defaultValue = text;
                        // 使用DOM直接修改
                        if ('setRangeText' in input) {
                            input.setRangeText(text, 0, input.value.length);
                        }
                    } catch (err) {
                        // 设置失败
                    }
                }
            } else if (input.isContentEditable) {
                // contenteditable元素
                input.textContent = text;
                
                // 触发contenteditable内容变更事件
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // 其他情况，尝试所有方法
                if ('value' in input) {
                    input.value = text;
                } else {
                    input.textContent = text;
                }
                
                // 尝试多种事件触发
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (error) {
            // 紧急备用方案：尝试直接设置innerHTML
            try {
                input.innerHTML = text;
            } catch (innerError) {
                // 备用方法失败
            }
        }
    }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script收到消息:', request);
    if (request.action === 'updateSettings') {
        console.log('收到设置更新:', request.settings);
        sendResponse({ success: true });
    }
    return true;
});

// 添加连接状态检查
function checkExtensionConnection() {
    try {
        // 尝试发送简单消息到background以检查连接
        chrome.runtime.sendMessage({ action: 'ping' }, response => {
            if (chrome.runtime.lastError) {
                console.error('扩展连接错误:', chrome.runtime.lastError.message);
                // 如果错误是由于上下文失效导致的，提示刷新页面
                if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                    const extensionError = document.createElement('div');
                    extensionError.style.position = 'fixed';
                    extensionError.style.top = '10px';
                    extensionError.style.right = '10px';
                    extensionError.style.backgroundColor = '#FFD2D2';
                    extensionError.style.padding = '10px';
                    extensionError.style.borderRadius = '5px';
                    extensionError.style.zIndex = '10000';
                    extensionError.textContent = 'AI文本优化器已失效，请刷新页面';
                    document.body.appendChild(extensionError);
                    
                    // 5秒后自动移除提示
                    setTimeout(() => {
                        if (extensionError.parentNode) {
                            extensionError.parentNode.removeChild(extensionError);
                        }
                    }, 5000);
                }
            } else {
                console.log('扩展连接正常');
            }
        });
    } catch (error) {
        console.error('检查扩展连接状态失败:', error);
    }
}

// 页面可见性变化时检查连接
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('页面变为可见，检查扩展连接');
        checkExtensionConnection();
    }
});

// 页面加载完成后检查连接
window.addEventListener('load', () => {
    console.log('页面加载完成，检查扩展连接');
    checkExtensionConnection();
});

// 每5分钟检查一次连接状态
setInterval(checkExtensionConnection, 300000);

// 初始化输入框检测器
const detector = new InputDetector();