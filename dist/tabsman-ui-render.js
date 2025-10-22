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
import * as Persistence from './tabsman-persistence.js';
import { injectTabsmanShell, cleanupTabsmanShell } from './tabsman-ui-container.js';
const TabsmanCore = {
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

let unsubscribeDockedPanelId = null;
let unsubscribeDockedPanelWaiter = null;
let dockedPanelId = null;

let rendering = false;


/**
 * 通用退订函数
 * @param {Function|null} unsubscribeFn - 退订函数
 * @returns {null} 返回 null 用于重新赋值
 */
function cleanupSubscription(unsubscribeFn) {
    if (unsubscribeFn) {
        unsubscribeFn();
    }
    return null;
}

/**
 * 获取tabsman标签页容器元素
 * @returns {Element|null} 返回标签页容器元素
 */
function getTabsmanTabsEle() {
    return tabsmanTabsEle;
}

/**
 * 创建单个标签页的DOM元素
 * @param {Object} tab - 标签页数据
 * @param {string} panelId - 面板ID
 * @returns {Promise<Object>} 返回包含DOM元素和子元素引用的对象
 */
async function createTabElement(tab, panelId) {
    // 判断是否为收藏块
    let isFavorite = false;
    if (Persistence.getFavoriteBlockArray().findIndex(item => item.id.toString() === tab.currentBlockId.toString()) !== -1) {
        isFavorite = true;
    }

    const tabElement = document.createElement('div');
    // ⭐️⭐️⭐️借用fav-item-item样式，性质是相同的。
    // plugin-tabsman-item-item为了适配tune-theme
    tabElement.className = 'plugin-tabsman-tab-item plugin-tabsman-item-item orca-fav-item-item';
    tabElement.setAttribute('data-tabsman-tab-id', tab.id);
    tabElement.setAttribute('data-tabsman-panel-id', panelId);
    tabElement.setAttribute('draggable', 'true');

    // 置顶图标
    const pinIcon = document.createElement('i');
    pinIcon.className = `plugin-tabsman-tab-pin ti ${tab.isPinned ? 'ti-pinned-filled' : 'ti-pinned'}`;

    // 块图标
    const blockIcon = document.createElement('i');
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质是相同的。
    blockIcon.className = `plugin-tabsman-tab-icon orca-fav-item-icon orca-fav-item-icon-font ${tab.currentIcon} ${isFavorite ? 'plugin-tabsman-tab-favorite' : ''}`;
    blockIcon.setAttribute('data-tabsman-tab-id', tab.id);
    blockIcon.setAttribute('data-tabsman-panel-id', panelId);

    // 标签页标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = document.createElement('div');
    title.className = 'plugin-tabsman-tab-title orca-fav-item-label';
    title.textContent = tab.name || `标签页 ${tab.id}`;

    // 关闭按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const closeBtn = document.createElement('i');
    closeBtn.className = 'plugin-tabsman-tab-close ti ti-x orca-fav-item-menu';
    closeBtn.setAttribute('data-tabsman-tab-id', tab.id);
    closeBtn.setAttribute('data-tabsman-panel-id', panelId);

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
    panelItemElement.setAttribute('data-tabsman-panel-id', panelId);

    // 折叠图标
    // ⭐️⭐️⭐️借用fav-item-icon样式，性质类似性质类似性质类似（需要微调）。
    const collapseIcon = document.createElement('i');
    collapseIcon.className = 'plugin-tabsman-panel-collapse-icon orca-fav-item-icon orca-fav-item-icon-font';
    if (panelId !== dockedPanelId) {
        collapseIcon.className += ' ti ti-chevron-down';
    } else {
        collapseIcon.className += ' ti ti-window-minimize';
    } 

    // 面板标题
    // ⭐️⭐️⭐️借用fav-item-label样式，性质是相同的。
    const title = document.createElement('div');
    title.className = 'plugin-tabsman-panel-title orca-fav-item-label';
    if (panelId === dockedPanelId) {
        title.textContent = "Docked";
    } else {
        title.textContent = `面板 ${panelId}`;
    }

    // 创建新标签页按钮
    // ⭐️⭐️⭐️借用fav-item-menu样式，性质是相同的。
    const newTabButton = document.createElement('i');
    newTabButton.className = 'plugin-tabsman-panel-new-tab ti ti-plus orca-fav-item-menu';
    newTabButton.setAttribute('data-tabsman-panel-id', panelId);

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
 * 处理tabsman容器点击事件
 * @param {Event} e - 点击事件
 */
async function handleTabsmanClick(e) {
    // 处理标签页相关事件
    const tabElement = e.target.closest('.plugin-tabsman-tab-item');
    if (tabElement) {
        const tabId = tabElement.getAttribute('data-tabsman-tab-id');
        const panelId = tabElement.getAttribute('data-tabsman-panel-id');
        
        // 确保有tabId和panelId
        if (!tabId || !panelId) return;

        const tab = TabsmanCore.data.getAllTabs()[tabId];
        // 确保有tab对象
        if (!tab) return;

        if (e.target.classList.contains('plugin-tabsman-tab-pin')) {
            e.stopPropagation();
            // 根据当前置顶状态切换置顶状态
            if (tab.isPinned) {
                await TabsmanCore.actions.unpinTab(tab.id);
            } else {
                await TabsmanCore.actions.pinTab(tab.id);
            }
        } else if (e.target.classList.contains('plugin-tabsman-tab-close')) {
            e.stopPropagation();
            await TabsmanCore.actions.deleteTab(tab.id);
        } else if (e.target.classList.contains('plugin-tabsman-tab-icon')) {
            e.stopPropagation();
            // 点击块图标切换收藏状态
            const isFavorite = e.target.classList.toggle('plugin-tabsman-tab-favorite');
            if (isFavorite) {
                await Persistence.addAndSaveFavoriteBlock({id: tab.currentBlockId, icon: tab.currentIcon, title: tab.name});
            } else {
                await Persistence.removeAndSaveFavoriteBlock(tab.currentBlockId);
            }
            renderTabsByPanel();
        } else {
            // 如果点击的是停靠面板Tab是折叠状态，则切换到展开，但如果不是折叠状态且点击的本就是停靠面板前台标签页且面板是active，则切换折叠。
            // 如果点击的是不是停靠面板Tab，且停靠面板不是折叠，则先切换到折叠。
            if (panelId === dockedPanelId && window.dockedPanelIsCollapsed) {
                await orca.commands.invokeCommand("dockpanel.toggleDockedPanelCollapse");
            } else if (panelId === dockedPanelId && !window.dockedPanelIsCollapsed && tab.id === TabsmanCore.data.getActiveTabs()[panelId].id && orca.state.activePanel === dockedPanelId) {
                await orca.commands.invokeCommand("dockpanel.toggleDockedPanelCollapse");
            } else if (panelId !== dockedPanelId && !window.dockedPanelIsCollapsed) {
                await orca.commands.invokeCommand("dockpanel.toggleDockedPanelCollapse");
            }

            // 点击其他区域切换到目标标签页
            await TabsmanCore.actions.switchTab(tab.id);
        }
        return;
    }

    // 处理面板相关事件
    const panelElement = e.target.closest('.plugin-tabsman-panel-item');
    if (panelElement) {
        if (e.target.classList.contains('plugin-tabsman-panel-collapse-icon')) {
            e.stopPropagation();
            // TODO: 实现折叠/展开功能
            // orca.notify('切换面板折叠状态');
        } else if (e.target.classList.contains('plugin-tabsman-panel-new-tab')) {
            e.stopPropagation();
            const panelId = e.target.getAttribute('data-tabsman-panel-id');
            if (panelId) {
                await TabsmanCore.actions.createTab(-1, false, panelId);
            }
        }
        return;
    }
}

/**
 * 按面板分组渲染所有标签页列表
 * @returns {Promise<void>}
 */
async function renderTabsByPanel() {
    if (rendering) return;
    rendering = true;
    const tabsmanTabsEle = getTabsmanTabsEle();
    if (!tabsmanTabsEle) {
        console.warn('未找到tabsman标签页容器');
        return;
    }

    // 清空现有内容
    tabsmanTabsEle.innerHTML = '';

    // 获取所有面板的排序标签页列表（直接使用核心模块的排序缓存）
    const allSortedTabs = TabsmanCore.data.getAllSortedTabs();

    if (allSortedTabs && allSortedTabs.size > 0) {
        // 直接遍历已排序的标签页列表，避免重复函数调用
        for (const [panelId, panelTabs] of allSortedTabs) {
            if (panelTabs.length === 0) continue;
            // 创建面板分组容器
            const panelGroup = document.createElement('div');
            // ⭐️⭐️⭐️借用fav-item样式，性质是相同的。
            panelGroup.className = 'plugin-tabsman-panel-group orca-fav-item';
            panelGroup.setAttribute('data-tabsman-panel-id', panelId);

            // 创建面板标题项
            const panelItem = await createPanelItemElement(panelId);

            panelGroup.appendChild(panelItem.element);

            // 渲染该面板的标签页并加入面板分组容器
            for (const tab of panelTabs) {
                const tabItem = await createTabElement(tab, panelId);

                // 添加活跃状态样式并加入面板分组容器
                const activeTabs = TabsmanCore.data.getActiveTabs();
                if (activeTabs && activeTabs[panelId] === tab) {
                    tabItem.element.classList.add('active-tab-item');
                }

                // 加入面板分组容器
                panelGroup.appendChild(tabItem.element);
            }
            tabsmanTabsEle.appendChild(panelGroup);
        }

        // 在所有面板组都添加到DOM后，为当前活跃面板添加class plugin-tabsman-panel-group-active
        const activePanel = orca.state.activePanel;
        const activePanelGroup = document.querySelector(`.plugin-tabsman-panel-group[data-tabsman-panel-id="${activePanel}"]`);
        if (activePanelGroup) {
            activePanelGroup.classList.add('plugin-tabsman-panel-group-active');
        }
    }
    rendering = false;
}


/**
 * 启动标签页渲染系统
 * @returns {Promise<boolean>} 返回启动是否成功
 */
async function startTabsRender() {
    try {
        // 确保容器存在，如果不存在则创建
        const result = await injectTabsmanShell();
        if (!result) {
            console.error('tabsmanUI外壳注入失败');
            return false;
        }
        
        // 直接获取标签页容器元素
        tabsmanTabsEle = result.tabsmanTabsEl;
        if (!tabsmanTabsEle) {
            console.error('未找到tabsmanTabsEle');
            return false;
        }

        // 注册监听器
        tabsmanTabsEle.addEventListener('click', handleTabsmanClick);
        setUpTabDragAndDrop();

        dockedpanelSubscribe();

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
    tabsmanTabsEle.removeEventListener('click', handleTabsmanClick);
    cleanupTabDragAndDrop();
    // 清理注入的外壳（包含所有渲染元素）
    cleanupTabsmanShell();
    
    // 清理所有订阅
    unsubscribeDockedPanelId = cleanupSubscription(unsubscribeDockedPanelId);
    unsubscribeDockedPanelWaiter = cleanupSubscription(unsubscribeDockedPanelWaiter);

    // 清理全局变量
    dragTabId = null;
}

// 导出模块接口
export {
    startTabsRender,
    stopTabsRender,
    renderTabsByPanel
};



/**
 * 订阅停靠面板ID变化
 * 通过监听 orca.state.plugins 等待 dockedPanelState 暴露后再订阅
 * @returns {void}
 */
function dockedpanelSubscribe() {
    if (!window.Valtio || !window.Valtio.subscribe) {
        console.warn('[tabsman] Valtio 不可用，无法订阅停靠面板状态');
        return;
    }

    // 检查所有插件是否都已加载完成
    const areAllPluginsLoaded = () => {
        const { plugins } = orca.state;
        const enabledPlugins = Object.entries(plugins).filter(([, plugin]) => plugin && plugin.enabled);
        const loadingPlugins = enabledPlugins.filter(([, plugin]) => !plugin.module);
        return loadingPlugins.length === 0;
    };

    // 检查 window.dockedPanelState 是否已暴露
    const checkAndSubscribe = () => {
        // 检查是否存在 dockedPanelState 对象，存在就订阅，不存在就结束等待下一次检查，直到所有插件加载完成。
        if (window.dockedPanelState) {
            // 订阅停靠面板状态变化
            unsubscribeDockedPanelId = window.Valtio.subscribe(window.dockedPanelState, () => {
                if (window.dockedPanelState.id !== null) {
                    dockedPanelId = window.dockedPanelState.id;
                    renderTabsByPanel();
                }
            });
            console.log('[tabsman] 已订阅停靠面板状态变化');
            unsubscribeDockedPanelWaiter = cleanupSubscription(unsubscribeDockedPanelWaiter);
            return true;
        }
        
        // 如果所有插件都加载完了还没有，说明没有 dockpanel 插件
        if (areAllPluginsLoaded()) {
            console.log('[tabsman] 所有插件已加载完成，未检测到 dockedPanelState，停止等待');
            unsubscribeDockedPanelWaiter = cleanupSubscription(unsubscribeDockedPanelWaiter);
            return true; // 返回 true 表示结束等待
        }
        
        return false;
    };

    // 先尝试直接订阅（可能已经加载了）
    if (checkAndSubscribe()) {
        return;
    }
    // 订阅插件列表变化，变化时触发回调，直到找到 dockedPanelState 或所有插件加载完成后，退订。
    unsubscribeDockedPanelWaiter = window.Valtio.subscribe(orca.state.plugins, () => {
        checkAndSubscribe();
    });
    console.log('[tabsman] 正在等待 dockedPanelState 暴露...');
}



/**
 * 设置标签页拖拽和放置事件
 * @returns {void}
 */
let dragTabId = null;
function setUpTabDragAndDrop() {
    tabsmanTabsEle.addEventListener('dragstart', handleTabDragStart);
    tabsmanTabsEle.addEventListener('dragover', handleTabDragOver);
    tabsmanTabsEle.addEventListener('drop', handleTabDrop);
    tabsmanTabsEle.addEventListener('dragend', handleTabDragEnd);
}

function cleanupTabDragAndDrop() {
    tabsmanTabsEle.removeEventListener('dragstart', handleTabDragStart);
    tabsmanTabsEle.removeEventListener('dragover', handleTabDragOver);
    tabsmanTabsEle.removeEventListener('drop', handleTabDrop);
    tabsmanTabsEle.removeEventListener('dragend', handleTabDragEnd);
}

function handleTabDragStart(e) {
    const tabElement = e.target.closest('.plugin-tabsman-tab-item');
    if (tabElement) {
        dragTabId = tabElement.getAttribute('data-tabsman-tab-id');
    }
}

function handleTabDragOver(e) {
    const panelElement = e.target.closest('.plugin-tabsman-panel-group');
    if (panelElement) {
        e.preventDefault();
        
        // 清理所有面板的高亮
        document.querySelectorAll('.plugin-tabsman-panel-group').forEach(el => {
            el.classList.remove('plugin-tabsman-panel-group-drag-over');
        });
        
        // 为当前面板添加高亮
        panelElement.classList.add('plugin-tabsman-panel-group-drag-over');
    }
}

async function handleTabDrop(e) {
    const panelElement = e.target.closest('.plugin-tabsman-panel-group');
    if (panelElement) {
        e.preventDefault();
        await window.moveTabToPanel(dragTabId, panelElement.getAttribute('data-tabsman-panel-id'));
    }
}

function handleTabDragEnd(e) {
    const panelElement = e.target.closest('.plugin-tabsman-panel-group');
    if (panelElement) {
        panelElement.classList.remove('plugin-tabsman-panel-group-drag-over');
    }
}


