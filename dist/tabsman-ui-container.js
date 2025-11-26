// Orca Tabsman Plugin - UI外壳模块
// 负责创建和注入标签页管理器的UI外壳到Orca侧边栏中
let tabsmanShell = null;
const createDomWithClass = window.pluginTabsman.createDomWithClass

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
    const tabsmanContainer = createDomWithClass("div", 'plugin-tabsman-container orca-favorites-list', hideableContainer)
    
    // 创建 .plugin-tabsman-tabs 元素
    // ⭐️⭐️⭐️借用orca-favorites-items样式，性质是相同的。
    const tabsmanTabs = createDomWithClass("div", 'plugin-tabsman-tabs orca-favorites-items', tabsmanContainer)
    
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
        const sidebarTabsEl = document.querySelector('.orca-sidebar-tabs');
        const sidebarTabOptionsEl = document.querySelector('.orca-sidebar-tab-options');
        
        // 注入侧边栏内容外壳和tab-option
        const hideableContainer = injectHideableContainer(sidebarTabsEl);
        const tabOptionEl = createDomWithClass("div", 'orca-segmented-item plugin-tabsman-tab-option', sidebarTabOptionsEl)
        tabOptionEl.textContent = 'Tabs';

        // 监听点击tab-option事件
        sidebarTabOptionsEl.addEventListener('click', (e) => {
            // 如果tab-option已选中，则取消选中
            if (e.target.classList.contains('plugin-tabsman-tab-option')) {
                if (!sidebarTabOptionsEl.classList.contains('plugin-tabsman-selected')) {
                    sidebarTabOptionsEl.classList.add('plugin-tabsman-selected');
                    tabOptionEl.classList.add('orca-selected');
                }
            } else {
                if (sidebarTabOptionsEl.classList.contains('plugin-tabsman-selected')) {
                    sidebarTabOptionsEl.classList.remove('plugin-tabsman-selected');
                    tabOptionEl.classList.remove('orca-selected');
                }
            }
        });
        
        // 保存完整的外壳对象（支持链式调用）到全局变量并返回
        tabsmanShell = {
            parentElement: sidebarTabOptionsEl,
            tabOptionEl: tabOptionEl,
            hideableContainerEl: hideableContainer.element,
            tabsmanContainerEl: hideableContainer.tabsmanContainer.element,
            tabsmanTabsEl: hideableContainer.tabsmanContainer.tabsmanTabs.element,
        };
        
        // 设置Orca命令拦截
        setOrcaCommandIntercept();
        
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
    
    // 清理Orca命令拦截
    cleanupOrcaCommandIntercept();
    
    // 清理全局变量
    tabsmanShell = null;
}


let commandHandler = {
    removeFn: (optionName) => {
        const bodyApp = document.querySelector("body>#app");
        // 如果当前是tabs栏，则先移除tabs栏选中样式，再查看当前是否就是目标栏，不是，就返回true执行切换，是就false不用执行。
        if (tabsmanShell.parentElement.classList.contains('plugin-tabsman-selected')) {
            tabsmanShell.parentElement.classList.remove('plugin-tabsman-selected');
            tabsmanShell.tabOptionEl.classList.remove('orca-selected');

            // 如果是关闭面板，就正常执行命令
            if (bodyApp.className === "sidebar-closed") return true

            return orca.state.sidebarTab !== optionName;
        }
        return true;
    },
    goFavorites: () => commandHandler.removeFn("favorites"),
    goTags: () => commandHandler.removeFn("tags"),
    goPages: () => commandHandler.removeFn("pages")
}

/** 设置Orca命令拦截 */
function setOrcaCommandIntercept() {
    orca.commands.registerBeforeCommand("core.sidebar.goFavorites", commandHandler.goFavorites);
    orca.commands.registerBeforeCommand("core.sidebar.goTags", commandHandler.goTags);
    orca.commands.registerBeforeCommand("core.sidebar.goPages", commandHandler.goPages);
}

/** 清理Orca命令拦截 */
function cleanupOrcaCommandIntercept() {
    orca.commands.unregisterBeforeCommand("core.sidebar.goFavorites", commandHandler.goFavorites);
    orca.commands.unregisterBeforeCommand("core.sidebar.goTags", commandHandler.goTags);
    orca.commands.unregisterBeforeCommand("core.sidebar.goPages", commandHandler.goPages);
    commandHandler = null;
}

// 导出模块接口
export {
    injectTabsmanShell,
    cleanupTabsmanShell
};