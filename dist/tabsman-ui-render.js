// Orca Tabsman Plugin - UI渲染模块
// 负责标签页列表的显示和实时更新

// 创建命名空间对象，提供更直观的API
import {
    getTabIdSetByPanelId,
    getAllTabs,
    getActiveTabs,
    getOneSortedTabs,
    getAllSortedTabs,
    createTab,
    deleteTab,
    switchTab,
    pinTab,
    unpinTab
} from './tabsman-core.js';

const Tabsman = {
    // 数据访问层
    data: {
        getTabIdSetByPanelId,
        getAllTabs,
        getActiveTabs,
        getOneSortedTabs,
        getAllSortedTabs,
    },

    // 操作执行层
    actions: {
        createTab,
        deleteTab,
        switchTab,
        pinTab,
        unpinTab,
    }
};

// 全局变量存储标签页容器元素
let tabsmanTabsEle = null;

/**
 * 获取tabsman标签页容器元素
 * @returns {Element|null} 返回标签页容器元素
 */
function getTabsmanTabsEle() {
    return tabsmanTabsEle;
}

/**
 * 清理tabsman标签页容器引用
 * @returns {void}
 */
function clearTabsmanTabsEle() {
    tabsmanTabsEle = null;
}


/**
 * 创建单个标签页的DOM元素
 * @param {Object} tab - 标签页数据
 * @param {string} panelId - 面板ID
 * @returns {Promise<Object>} 返回包含DOM元素和子元素引用的对象
 */
async function createTabElement(tab, panelId) {
    const tabElement = document.createElement('div');
    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    tabElement.className = 'plugin-tabsman-tab-item plugin-tabsman-item-item orca-fav-item-item';
    tabElement.setAttribute('data-tab-id', tab.id);
    tabElement.setAttribute('data-panel-id', panelId);

    // 置顶图标
    const pinIcon = document.createElement('i');
    pinIcon.className = `plugin-tabsman-tab-pin ti ${tab.isPinned ? 'ti-pinned-filled' : 'ti-pinned'}`;

    // 块图标
    const blockIcon = document.createElement('i');
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质是相同的。
    blockIcon.className = 'plugin-tabsman-tab-icon orca-fav-item-icon orca-fav-item-icon-font';
    blockIcon.setAttribute('data-tab-id', tab.id);
    blockIcon.setAttribute('data-panel-id', panelId);

    // 根据存储的图标类名设置图标
    const iconClass = tab.currentIcon || 'ti ti-cube';
    blockIcon.className += ` ${iconClass}`;

    // 标签页标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = document.createElement('div');
    title.className = 'plugin-tabsman-tab-title orca-fav-item-label';
    title.textContent = tab.name || `标签页 ${tab.id}`;

    // 关闭按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const closeBtn = document.createElement('i');
    closeBtn.className = 'plugin-tabsman-tab-close ti ti-x orca-fav-item-menu';
    closeBtn.setAttribute('data-tab-id', tab.id);
    closeBtn.setAttribute('data-panel-id', panelId);

    tabElement.appendChild(pinIcon);
    tabElement.appendChild(blockIcon);
    tabElement.appendChild(title);
    tabElement.appendChild(closeBtn);

    // 返回包含DOM元素和子元素引用的对象
    return {
        element: tabElement,
        pinIcon: pinIcon,
        blockIcon: blockIcon,
        title: title,
        closeBtn: closeBtn
    };
}

/**
 * 创建单个面板item的DOM元素
 * @param {string} panelId - 面板ID
 * @returns {Promise<Object>} 返回包含DOM元素和子元素引用的对象
 */
async function createPanelItemElement(panelId) {
    const panelItemElement = document.createElement('div');
    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    panelItemElement.className = 'plugin-tabsman-panel-item plugin-tabsman-item-item orca-fav-item-item';
    panelItemElement.setAttribute('data-panel-id', panelId);

    // 折叠图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质类似性质类似性质类似（需要微调）。
    const collapseIcon = document.createElement('i');
    collapseIcon.className = 'plugin-tabsman-panel-collapse-icon ti ti-chevron-down orca-fav-item-icon orca-fav-item-icon-font';

    // 面板标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = document.createElement('div');
    title.className = 'plugin-tabsman-panel-title orca-fav-item-label';
    title.textContent = `面板 ${panelId}`;

    // 创建新标签页按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const newTabButton = document.createElement('i');
    newTabButton.className = 'plugin-tabsman-panel-new-tab ti ti-plus orca-fav-item-menu';

    panelItemElement.appendChild(collapseIcon);
    panelItemElement.appendChild(title);
    panelItemElement.appendChild(newTabButton);

    // 返回包含DOM元素和子元素引用的对象
    return {
        element: panelItemElement,
        collapseIcon: collapseIcon,
        title: title,
        newTabButton: newTabButton
    };
}



/**
 * 按面板分组渲染所有标签页列表
 * @returns {Promise<void>}
 */
async function renderTabsByPanel() {
    const tabsmanTabsEle = getTabsmanTabsEle();
    if (!tabsmanTabsEle) {
        console.warn('未找到tabsman标签页容器');
        return;
    }

    // 清空现有内容
    tabsmanTabsEle.innerHTML = '';

    // 获取所有面板的排序标签页列表（直接使用核心模块的排序缓存）
    const allSortedTabs = Tabsman.data.getAllSortedTabs();

    if (allSortedTabs && allSortedTabs.size > 0) {
        // 直接遍历已排序的标签页列表，避免重复函数调用
        for (const [panelId, panelTabs] of allSortedTabs) {
            if (panelTabs.length === 0) continue;
            // 创建面板分组容器
            const panelGroup = document.createElement('div');
            // ⭐️⭐️⭐️借用fav-item样式，性质是相同的。
            panelGroup.className = 'plugin-tabsman-panel-group orca-fav-item';
            panelGroup.setAttribute('data-panel-id', panelId);

            // 创建面板标题项
            const panelItem = await createPanelItemElement(panelId);

            // 添加面板项事件处理
            panelItem.collapseIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                // TODO: 实现折叠/展开功能
                // orca.notify('切换面板折叠状态');
            });

            panelItem.newTabButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                // 在当前面板创建新标签页
                await Tabsman.actions.createTab(-1, false, panelId);
            });

            panelGroup.appendChild(panelItem.element);

            // 渲染该面板的标签页并加入面板分组容器
            for (const tab of panelTabs) {
                const tabItem = await createTabElement(tab, panelId);
                // 添加点击事件处理
                tabItem.element.addEventListener('click', async (e) => {
                    if (e.target === tabItem.pinIcon) {
                        e.stopPropagation();
                        // 根据当前置顶状态切换
                        if (tab.isPinned) {
                            await Tabsman.actions.unpinTab(tab.id);
                        } else {
                            await Tabsman.actions.pinTab(tab.id);
                        }
                    } else if (e.target === tabItem.closeBtn) {
                        e.stopPropagation();
                        await Tabsman.actions.deleteTab(tab.id);
                        return;
                    } else {
                        // 点击其他区域切换到该标签页
                        await Tabsman.actions.switchTab(tab.id);
                    }
                });

                // 添加活跃状态样式并加入面板分组容器
                const activeTabs = Tabsman.data.getActiveTabs();
                if (activeTabs && activeTabs[panelId] === tab) {
                    tabItem.element.classList.add('active-tab-item');
                }

                // 加入面板分组容器
                panelGroup.appendChild(tabItem.element);
            }
            tabsmanTabsEle.appendChild(panelGroup);
        }

        // 在所有面板组都添加到DOM后，为当前活跃面板添加class active-panel
        const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-panel-id="${orca.state.activePanel}"]`);
        if (activePanelGroup) {
            activePanelGroup.classList.add('active-panel');
        }
    }
}


/**
 * 启动标签页渲染系统
 * @returns {Promise<boolean>} 返回启动是否成功
 */
async function startTabsRender() {
    try {
        // 等待标签页容器加载并存储到全局变量
        tabsmanTabsEle = document.querySelector('.plugin-tabsman-tabs');
        if (!tabsmanTabsEle) {
            console.error('未找到tabsman标签页容器');
            return false;
        }

        return true;

    } catch (error) {
        console.error('标签页渲染系统启动失败:', error);
        return false;
    }
}

/**
 * 停止标签页渲染系统
 * @returns {void}
 */
function stopTabsRender() {
    // 清理标签页容器引用
    clearTabsmanTabsEle();
}

// 导出模块接口
export {
    startTabsRender,
    stopTabsRender,
    renderTabsByPanel
};
