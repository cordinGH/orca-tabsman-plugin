// Orca Tabsman Plugin - UI外壳模块
// 负责创建和注入标签页管理器的UI外壳到Orca侧边栏中
let tabsmanShell = null;

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
    
    // 返回带有子元素引用的对象，链式调用
    return {
        element: hideableContainer,
        tabsmanContainer: {
            element: tabsmanContainer,
            tabsmanTabs: {
                element: tabsmanTabs
            }
        }
    };
}




/**
 * 注入标签页管理器外壳，包括创建和注入基本UI外壳
 * @returns {Promise<Object|null>} 返回外壳对象或null
 */
async function injectTabsmanShell() {
    try {
        // 先等待所有需要的元素
        const sidebarTabsEl = await waitForElement('.orca-sidebar-tabs');
        const sidebarTabOptionsEl = await waitForElement('.orca-sidebar-tab-options');
        
        if (!sidebarTabsEl) {
            console.error('未找到 .orca-sidebar-tabs 元素');
            return false;
        }
        
        if (!sidebarTabOptionsEl) {
            console.error('未找到 .orca-sidebar-tab-options 元素');
            return false;
        }
        
        // 注入侧边栏内容外壳和tab-option
        const hideableContainer = injectHideableContainer(sidebarTabsEl);
        const tabOptionEl = document.createElement('div');
        tabOptionEl.className = 'orca-segmented-item plugin-tabsman-tab-option';
        tabOptionEl.textContent = 'Tabs';
        sidebarTabOptionsEl.appendChild(tabOptionEl);

        // 监听点击tab-option事件
        sidebarTabOptionsEl.addEventListener('click', (e) => {
            if (e.target === tabOptionEl) {
                sidebarTabOptionsEl.classList.add('plugin-tabsman-selected');
                tabOptionEl.classList.add('orca-selected');
            } else {
                sidebarTabOptionsEl.classList.remove('plugin-tabsman-selected');
                tabOptionEl.classList.remove('orca-selected');
            }
        });
        
        // 保存完整的外壳对象（支持链式调用）到全局变量并返回
        tabsmanShell = {
            tabOptionEl: tabOptionEl,
            hideableContainerEl: hideableContainer.element,
            tabsmanContainerEl: hideableContainer.tabsmanContainer.element,
            tabsmanTabsEl: hideableContainer.tabsmanContainer.tabsmanTabs.element,
        };
        
    } catch (error) {
        console.error('外壳注入失败:', error);
    }
    
    return tabsmanShell;
}


/**
 * 清理所有注入的标签页管理器外壳
 * @returns {void}
 */
function cleanupTabsmanShell() {
    if (!tabsmanShell) return;
    
    // 提取元素引用
    const hideableContainerEl = tabsmanShell.hideableContainerEl;
    const tabOptionEl = tabsmanShell.tabOptionEl;
    
    // 清理容器外壳
    if (hideableContainerEl?.parentNode) {
        hideableContainerEl.parentNode.removeChild(hideableContainerEl);
    }
    
    // 清理tab-option
    if (tabOptionEl?.parentNode) {
        tabOptionEl.parentNode.removeChild(tabOptionEl);
    }
    
    // 清理全局变量
    tabsmanShell = null;
    
    // 清理元素缓存
    elementCache.clear();
}

// 导出模块接口
export {
    injectTabsmanShell,
    cleanupTabsmanShell
};
