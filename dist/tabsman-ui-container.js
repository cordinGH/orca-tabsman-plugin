// Orca Tabsman Plugin - UI容器模块
// 负责创建和注入标签页管理器的UI容器到Orca侧边栏中

let hideableContainer = null;
let tabOption = null;

// 全局缓存对象，存储waitForElement处理过的元素
const elementCache = new Map();

/**
 * 等待指定元素在DOM中加载完成
 * @param {string} selector - 要等待的CSS选择器
 * @param {number} timeout - 超时时间（毫秒），默认10秒
 * @returns {Promise<Element|null>} 返回找到的元素或null
 */
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        // 如果元素已存在，直接返回并缓存
        const existingElement = document.querySelector(selector);
        if (existingElement) {
            elementCache.set(selector, existingElement);
            resolve(existingElement);
            return;
        }

        // 使用MutationObserver等待元素加载
        const observer = new MutationObserver((mutations) => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                elementCache.set(selector, element);
                resolve(element);
            }
        });

        // 开始观察
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 设置超时，避免无限等待
        setTimeout(() => {
            observer.disconnect();
            console.warn(`等待 ${selector} 元素超时`);
            resolve(null);
        }, timeout);
    });
}

/**
 * 创建并注入可隐藏容器到目标元素
 * @param {Element} targetElement - 目标容器元素
 * @returns {Element} 返回注入的可隐藏容器DOM元素
 */
function injectHideableContainer(targetElement) {
    // 创建 .orca-hideable 容器
    const hideableContainer = document.createElement('div');
    hideableContainer.className = 'orca-hideable';

    // 创建 .plugin-tabsman-container 元素
    // ⭐️⭐️⭐️借用orca-favorites-list样式，性质是相同的。
    const tabsmanContainer = document.createElement('div');
    tabsmanContainer.className = 'plugin-tabsman-container orca-favorites-list';
    
    // 创建 .plugin-tabsman-tabs 元素
    // ⭐️⭐️⭐️借用orca-favorites-items样式，性质是相同的。
    const tabsmanTabs = document.createElement('div');
    tabsmanTabs.className = 'plugin-tabsman-tabs orca-favorites-items';
    
    // 组装结构
    tabsmanContainer.appendChild(tabsmanTabs);
    hideableContainer.appendChild(tabsmanContainer);
    
    // 注入到.orca-sidebar-tabs
    targetElement.insertBefore(hideableContainer, targetElement.firstChild);
    
    return hideableContainer;
}


/**
 * 为.orca-sidebar-tab-options注入新item  
 * @param {Element} targetElement - 目标容器元素
 * @returns {Element} 返回注入在.orca-sidebar-tab-options中的DOM元素
 */
function injectTabOption(targetElement) {
    const tabOption = document.createElement('div');
    tabOption.className = 'orca-segmented-item plugin-tabsman-tab-option';
    tabOption.textContent = 'Tabs';
    
    // 注入到.orca-sidebar-tab-options
    targetElement.appendChild(tabOption);
    
    return tabOption;
}


/**
 * 注入标签页管理器容器，包括创建和注入基本UI容器
 * @returns {Promise<boolean>} 返回注入是否成功
 */
async function injectTabsmanContainers() {
    try {
        // 先等待所有需要的元素
        const sidebarTabs = await waitForElement('.orca-sidebar-tabs');
        const sidebarTabOptions = await waitForElement('.orca-sidebar-tab-options');
        
        if (!sidebarTabs) {
            console.error('未找到 .orca-sidebar-tabs 元素');
            return false;
        }
        
        if (!sidebarTabOptions) {
            console.error('未找到 .orca-sidebar-tab-options 元素');
            return false;
        }
        
        // 注入侧边栏内容容器和tab-option
        hideableContainer = injectHideableContainer(sidebarTabs);
        tabOption = injectTabOption(sidebarTabOptions);
        console.log('tabsman容器注入成功');

        // 监听点击tab-option事件
        sidebarTabOptions.addEventListener('click', (e) => {
            if (e.target === tabOption) {
                sidebarTabOptions.classList.add('plugin-tabsman-selected');
                tabOption.classList.add('orca-selected');
            } else {
                sidebarTabOptions.classList.remove('plugin-tabsman-selected');
                tabOption.classList.remove('orca-selected');
            }
        });
        
        return true;
        
    } catch (error) {
        console.error('容器注入失败:', error);
        return false;
    }
}


/**
 * 清理所有注入的标签页管理器容器
 * @returns {void}
 */
function cleanupTabsmanContainers() {
    // 清理容器外壳
    if (hideableContainer && hideableContainer.parentNode) {
        hideableContainer.parentNode.removeChild(hideableContainer);
        hideableContainer = null;
    }
    // 清理tab-option
    if (tabOption && tabOption.parentNode) {
        tabOption.parentNode.removeChild(tabOption);
        tabOption = null;
    }
    
    // 清理元素缓存
    elementCache.clear();
}

// 导出模块接口
export {
    injectTabsmanContainers,
    cleanupTabsmanContainers
};
