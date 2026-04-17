/**
 * Orca Tabsman Plugin - 核心逻辑模块
 * 
 * 基本特点：
 * - 各个标签页具有其独立的历史记录，互不影响
 * - 扁平化数据架构
 * - 命令拦截与历史同步
 * - 实时UI更新
 * 
 * Tab数据结构设计：
 * - tabs: 所有标签页对象的主存储，tabid - tab对象
 * - activeTabs: 每个面板当前活跃的标签页对象，panelid - tab对象
 * - tabIdSetByPanelId: 按面板ID分组的标签页ID集合索引，panelid - tabid集合
 * - sortedTabsByPanelId: 按面板ID分组的已排序标签页列表缓存，panelid - tab对象数组
 * 
 * 数据构建：
 * - 初始化时，为每个面板创建初始标签页
 * - 创建标签页时，更新相关数据结构
 * - 删除标签页时，更新相关数据结构
 * - 切换标签页时，更新相关数据结构
 * - 关闭面板时，更新相关数据结构
 * - 退出时，清理所有数据结构
 * 
 */

import * as TabsmanPersistence from './tabsman-persistence.js';
import * as WorkspaceRender from './tabsman-workspace.js'

// ==================== 常量 ====================

// 历史记录长度约束配置
const HISTORY_CONFIG = {
    MAX_BACK_STACK: 31,    // 后退栈最大长度
    MAX_FORWARD_STACK: 30  // 前进栈最大长度
};
// 插件视图特殊currentBlockId前缀
const PREFIX_PLUGIN_VIEW = "插件视图："
const PREFIX_BGRAPH_VIEW = "块图谱："
const OFFICIAL_VIEW_LIST = ["journal", "block", "bgraph"] // 官方视图列表，其他视图都视为自定义视图

// ===================== 函数变量 ==========================

// 标签页UI渲染回调函数
let renderTabsCallback = null;

// 原始的navAPI函数
let navOriginals = null

// 订阅取消函数
let unsubscribePanelBackHistory = null
let unsubscribeSettings = null

// 拦截器函数引用
let beforeCommandHooks = null
let afterCommandHooks = null

// ==================== 状态管理变量 ====================

/** @type {boolean} 标记是否启用快速笔记前缀 */
let enableQuickNotePrefix = false
/** @type {boolean} 标记是否启用快速笔记自动折叠 */
let enableAutoFoldQuickNotes = false
/** @type {number} 存储上一个快速笔记的blockId */
let lastQuickNoteBlockId = null;
/** @type {string} 快速笔记前缀字符串 */
let prefixString = "date"

// ==================== 全局数据存储 ====================

/** @type {Object} 所有标签页的主存储 {tabId: tab} */
let tabs = {};
let tabCounter = 0;  // 防止tabid重复的计数器

/** @type {Object} 每个面板当前活跃的标签页 {panelId: tab} */
let activeTabs = {};

/** @type {Map<string, Set<string>>} 按面板ID分组的标签页ID集合索引 */
let tabIdSetByPanelId = new Map();

// array存储是为了方便直接根据tabIdSet来转换出tab对象。
/** @type {Map<string, Array<Object>>} 按面板ID分组的已排序标签页列表缓存，用于渲染 */
let sortedTabsByPanelId = new Map();


// =======================================================

// 提供给外部模块的API，帮助外部模块将Tab对象或者tab对象数组，导入进数据结构
function importTabToActivePanel(tabInput) {
    const panelId = orca.state.activePanel
    const tabArrary = Array.isArray(tabInput) ? tabInput : [tabInput];
    for (const tab of tabArrary) {
        tab.panelId = panelId;
        tab.isActive = false;
        tabs[tab.id] = tab;
        tabIdSetByPanelId.get(panelId).add(tab.id)
    }
    updateSortedTabsCache(panelId);
}


// 确保当前tab的数字类型blockid是有效的，如果无效了（被删除了），则重定向为今日日志
async function __checkTabCurrentBlockId(tab) {
    const {currentBlockId} = tab
    if (typeof currentBlockId === "number") {
        // 存在块不处理
        if (await orca.invokeBackend("get-block", currentBlockId)) return

        // 不存在块，重定向为今日日志
        orca.notify("info",`[tabsman] 目标块${currentBlockId}已删除，现重定向为今日日志`)
        const date = new Date(new Date().toDateString())
        const name = date.toDateString()
        const icon = 'ti ti-calendar-smile'
        Object.assign(tab.at(-1), { icon, name, view: "journal", viewArgs: {date} })
        Object.assign(tab, { currentBlockId: date, name: date.toDateString(), currentIcon: 'ti ti-calendar-smile' })
    }
}

// 根据view和viewArgs获取tabsman所需的blockid
function getBlockIdByViewAndViewArgs(view, viewArgs) {
    let blockId = ""
    switch (view) {
        case "journal": blockId = viewArgs.date; break;
        case "block": blockId = viewArgs.blockId; break;
        case "bgraph": blockId = PREFIX_BGRAPH_VIEW + viewArgs.blockId; break;
        default: blockId = PREFIX_PLUGIN_VIEW + view
    }
    return blockId
}

// 获取tab当前的view和viewArgs
function getViewAndViewArgsByTab(tab) {
    const {currentBlockId, backStack} = tab
    let view = ""
    let viewArgs = null
    if (currentBlockId instanceof Date) {
        // 1. 日志视图
        view = 'journal';
        viewArgs = { date: currentBlockId };
    
    } else if (typeof currentBlockId === 'string') {
        // 2. 特殊视图（插件视图、块图谱视图）
        if (currentBlockId.startsWith(PREFIX_PLUGIN_VIEW)) {
            view = currentBlockId.slice(PREFIX_PLUGIN_VIEW.length);
            viewArgs = backStack.at(-1).viewArgs;
        } else if (currentBlockId.startsWith(PREFIX_BGRAPH_VIEW)) {
            view = "bgraph";
            viewArgs = backStack.at(-1).viewArgs;
        }

    } else if (typeof currentBlockId === 'number') {
        // 3. block视图
        view = 'block';
        viewArgs = { blockId: currentBlockId };
    }
    return {view, viewArgs}
}


// 为启动时的初始面板渲染一份基础tab
async function createTabsForInitialPanels() {
    const panelIds = []
    const processPanel = (panel) => {
        const {id, view, viewArgs} = panel || {}
        if (view && viewArgs) {
            panelIds.push(id)
        } else if (panel?.children) {
            panel.children.forEach(child => processPanel(child))
        }
    }
    processPanel(orca.state.panels)

    for (const panelId of panelIds) {
        await createTabForNewPanel(panelId, false);
    }
}


// ==================== 标签页信息生成和更新 ====================

/**
 * 生成标签页的名称和图标（优化版本，避免重复API调用）
 * @param {string} blockId - 块ID
 * @returns {Promise<{name: string, icon: string}>} 返回包含名称和图标的对象
 */
async function generateTabNameAndIcon(blockId) {
    if (!blockId) return {}

    // 如果是Date对象（journal视图），直接使用日期字符串
    if (blockId instanceof Date) {
        return { name: blockId.toDateString(), icon: 'ti ti-calendar-smile' }
    } else if (typeof blockId === "string") {
        if (blockId.startsWith(PREFIX_PLUGIN_VIEW)) {
            // 第三方插件视图
            return {name: blockId, icon: "ti ti-apps"}
        } else if (blockId.startsWith(PREFIX_BGRAPH_VIEW)) {
            // 块图谱视图（官方）
            return {name: blockId, icon: "ti ti-sitemap"}
        }
    }

    try {
        const block = await orca.invokeBackend("get-block", blockId);
        if (!block) return {}

        const blockRepr = block.properties.find(p => p.name === '_repr')
        const blockType = blockRepr.value.type
        
        // 生成名称
        let name = '新标签页';
        // 可编辑文本块，有别名且"显示为别名"则以别名作为name，否则显示text或type
        if (['ul', 'ol', 'text', 'heading', 'task'].includes(blockType)) {
            // 如果没找到_asAlias，说明是默认状态（显示为别名）
            let showAlias = false;
            if (block.aliases.length !== 0) {
                const blockAsAlias = block.properties.find(p => p.name === '_asAlias');   
                showAlias = blockAsAlias ? blockAsAlias.value : true;
            }

            if (showAlias) {
                name = block.aliases[0];
            } else {
                const {text} = block
                const shortText = (text?.length > 30) ? (text.slice(0, 30) + "...") : text
                name = text ? shortText : `(${blockType})`
            }
        } else {
            // 非可编辑文本块，如果存在caption，则显示caption作为name
            const blockCap = blockRepr.value.cap
            name = blockCap ? blockCap : `(${blockType})`
        }

        // 生成图标
        let icon = 'ti ti-cube';
        switch (blockType) {
            case 'heading':
                const headingLevel = blockRepr.value.level
                switch (headingLevel) {
                    case -1: icon = 'ti ti-heading'; break; 
                    case 1: icon = 'ti ti-h-1'; break;
                    case 2: icon = 'ti ti-h-2'; break;
                    case 3: icon = 'ti ti-h-3'; break;
                    case 4: icon = 'ti ti-h-4'; break;
                }
                break;
            case 'ul': icon = 'ti ti-list'; break;
            case 'ol': icon = 'ti ti-list-numbers'; break;
            case 'task': icon = 'ti ti-checkbox'; break;
            case 'code': icon = 'ti ti-code'; break;
            case 'quote2': icon = 'ti ti-blockquote'; break;
            case 'image': icon = 'ti ti-photo'; break;
            case 'video': icon = 'ti ti-movie'; break;
            case 'whiteboard': icon = 'ti ti-chalkboard'; break;
        }

        // 版本1.8.0，判断是否为标签从而覆盖icon，如果块有别名，但不在别名列表，则说明是标签，反之说明是别名块
        if (block.aliases.length !== 0){
            const blockAlias = block.aliases[0];
            const blockId = block.id;
            const aliasBlockIdList = (await orca.invokeBackend("get-aliased-blocks", blockAlias, 0, 99999))[1];
            icon = aliasBlockIdList.includes(blockId) ? "ti ti-file" : "ti ti-hash"
        }

        return { name, icon };
    } catch (error) {
        console.error("[tabsman]标签页生成失败", error)
        return { name: '标签页生成失败', icon: 'ti ti-cube' };
    }
}

/**
 * 用于在虎鲸官方的api跳转页面时，更新当前活跃标签页的属性和显示（块ID、名称、图标）
 * @returns {Promise<void>}
 */
async function updateTabProperties() {
    const activePanelId = orca.state.activePanel
    const activeTab = activeTabs[activePanelId];
    if (!activeTab) return;
    
    const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);
    const currentBlockId = getBlockIdByViewAndViewArgs(activePanel.view, activePanel.viewArgs)
    activeTab.currentBlockId = currentBlockId;
    
    // 比对是否需要更新，避免不必要的UI刷新
    const {name, icon} = await generateTabNameAndIcon(currentBlockId);
    if (activeTab.name === name && activeTab.currentIcon === icon) return;

    activeTab.name = name;
    activeTab.currentIcon = icon;
    if (renderTabsCallback) await renderTabsCallback({type: "update", currentTab: activeTab});
}

/**
 * 创建标签页对象
 * @param {string|null} currentBlockId - 当前块ID，默认为null
 * @param {string} panelId - 面板ID
 * @param {string} icon - 当前块图标类名，默认为'ti ti-cube'
 * @param {string} name - 标签页名称
 * @returns {Object} 返回标签页对象
 */
function createTabObject(currentBlockId = null, panelId, icon = 'ti ti-cube', name) {
    const now = new Date();
    // 生成格式：tab_YYMMDD_HHMMSSN (示例：tab_250110_2359591)
    const dateStr = now.getFullYear().toString().slice(-2) +
                   (now.getMonth() + 1).toString().padStart(2, '0') +
                   now.getDate().toString().padStart(2, '0') + '_' +
                   now.getHours().toString().padStart(2, '0') +
                   now.getMinutes().toString().padStart(2, '0') +
                   now.getSeconds().toString().padStart(2, '0');
    const tabId = `tab_${dateStr}${++tabCounter}`;
    return {
        id: tabId,
        panelId: panelId,
        name: name,
        createdAt: now,
        lastAccessedTs: 0, 
        isActive: false,

        // 当前显示块ID和图标
        currentBlockId: currentBlockId,
        currentIcon: icon,

        // Pin功能相关属性
        isPinned: false,        // 是否置顶
        pinTs: 0,            // 置顶时间戳


        // 新设计：使用双栈结构管理历史记录
        backStack: [],    // 后退栈：当前项 + 可以后退的历史
        forwardStack: []  // 前进栈：可以前进的历史
    };
}


/**
 * 更新指定面板的排序标签页列表缓存
 * @param {string} panelId - 面板ID
 */
function updateSortedTabsCache(panelId) {
    const tabIdSet = tabIdSetByPanelId.get(panelId);
    if (!tabIdSet || tabIdSet.size === 0) {
        sortedTabsByPanelId.delete(panelId);
        return;
    }
    
    // 获取所有标签页并按优先级排序
    const panelTabs = Array.from(tabIdSet).map(tabId => tabs[tabId]).sort((a, b) => {
            // 负数说明a索引更小更靠前，正数说明b索引更小更靠前
            // 返回pinOrder差值，越晚置顶的索引越靠前，越靠近顶部。
            if (a.isPinned && b.isPinned) return b.pinTs - a.pinTs;
            
            // 置顶的标签页排在前面
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            // 两个都没被置顶：越晚创建的索引越靠后，越靠近底部。
            return a.createdAt - b.createdAt;
        });
    
    // 更新缓存
    sortedTabsByPanelId.set(panelId, panelTabs);
}

/**
 * 设置设置变更监听器
 */
function subscribeSettings(pluginName) {
    enableQuickNotePrefix = orca.state.plugins[pluginName]?.settings.enableQuickNotePrefix
    enableAutoFoldQuickNotes = orca.state.plugins[pluginName]?.settings.enableAutoFoldQuickNotes
    prefixString = orca.state.plugins[pluginName]?.settings.prefixString.trim()
    unsubscribeSettings = window.Valtio.subscribe(orca.state.plugins[pluginName], () => {
        const settings = orca.state.plugins[pluginName]?.settings;
        if (!settings) {
            console.log("[tabsman] 设置选项加载失败")
            return
        }
        enableQuickNotePrefix = settings.enableQuickNotePrefix
        enableAutoFoldQuickNotes = settings.enableAutoFoldQuickNotes
        prefixString = settings.prefixString.trim()
    }
  )
}

// ==================== 标签页历史记录管理 ====================

function unsubscribeAll() {
    if (unsubscribeSettings) {
        unsubscribeSettings();
        unsubscribeSettings = null;
    } 
    if (unsubscribePanelBackHistory) {
        unsubscribePanelBackHistory();
        unsubscribePanelBackHistory = null;
    }
}

/**
 * 订阅orca后退历史变化，用于填充历史并更新当前tab对象的信息。已拦截了前进后退命令统一为了Goto，以确保后退历史始终是增长的。
 */
function subscribePanelBackHistory() {
    let lastHistoryLength = orca.state.panelBackHistory.length;
    unsubscribePanelBackHistory = window.Valtio.subscribe(orca.state.panelBackHistory, async () => {
        // 切换工作区期间，只重置lastHistoryLength，不做其他处理。
        if (workspaceSwitching) {
            lastHistoryLength = 0
            return
        }

        // orca历史减少时（由关闭面板这一行为触发。虎鲸1.41版本新特性），不做处理。
        const currentLength = orca.state.panelBackHistory.length;
        if (currentLength < lastHistoryLength) return;
        await fillCurrentAccess()

        // 更新tab信息
        await updateTabProperties()
        
        // 更新最后一次历史长度
        lastHistoryLength = currentLength;
    });
}


/**
 * 填充当前访问记录到当前面板的活跃标签页
 */
async function fillCurrentAccess() {
    const activePanelId = orca.state.activePanel
    const activeTab = activeTabs[activePanelId];
    if (!activeTab) return;
    
    const {id, view, viewArgs} = orca.nav.findViewPanel(activePanelId, orca.state.panels)
    const blockId = getBlockIdByViewAndViewArgs(view, viewArgs)
    const {name, icon} = await generateTabNameAndIcon(blockId)
    // 创建历史item
    const historyItem = {icon, name, sourcePanelId: id, view, viewArgs}

    // 添加到tab的历史记录，如果满了先移除最旧的
    // 约束后退栈长度：如果达到最大值，先移除最早的第一条历史
    if (activeTab.backStack.length >= HISTORY_CONFIG.MAX_BACK_STACK) activeTab.backStack.shift()
    activeTab.backStack.push(historyItem);
    activeTab.forwardStack.length = 0

    // 对于非官方视图，或者当前填充发生在置顶tab内（所以后退栈至少为2==>当前+新入），则pop本次填充，并新建一个tab跳转
    if (!OFFICIAL_VIEW_LIST.includes(view) || (activeTab.isPinned && activeTab.backStack.length >= 2)) {
        activeTab.backStack.pop()
        const newTab = await createTab({ currentBlockId: blockId, panelId: activePanelId, initHistoryInfo: {view, viewArgs} });
        newTab.isActive = true
        newTab.lastAccessedTs = Date.now();
        activeTab.isActive = false
        activeTabs[id] = newTab
        if (renderTabsCallback) await renderTabsCallback({type:"switch", currentTab: newTab , previousTab: activeTab});
    }
    
    // console.log(`[tabsman] 当前标签页 ${activeTab.id} 的访问记录已更新: 后退栈长度${activeTab.backStack.length}（包含当前访问）, 前进栈长度${activeTab.forwardStack.length}`);
}


/**
 * 在标签页历史中后退
 * @param {Object} tab - 标签页对象
 * @returns {Promise<boolean>} 返回是否成功后退
 */
async function navigateTabBack(tab) {
    
    // 检查是否可以后退
    if (tab.backStack.length <= 1) {
        orca.notify("info", "[tabsman] 当前标签页历史已到开头，无法后退");
        return false;
    }
    
    // 从后退栈移除当前项，放入前进栈
    const currentItem = tab.backStack.pop();
    
    // 约束前进栈长度：如果达到最大值，先移除最旧元素
    if (tab.forwardStack.length >= HISTORY_CONFIG.MAX_FORWARD_STACK) {
        tab.forwardStack.shift(); // 移除最旧的前进历史
    }
    tab.forwardStack.push(currentItem);
    
    // 获取新的当前项
    const newCurrent = tab.backStack[tab.backStack.length - 1];
    
    // 导航到新的当前项，并更新当前的tab信息
    orca.nav.replace(newCurrent.view, newCurrent.viewArgs, newCurrent.sourcePanelId);
    await updateTabProperties()
    
    return true;
}

/**
 * 在标签页历史中前进
 * @param {Object} tab - 标签页对象
 * @returns {Promise<boolean>} 返回是否成功前进
 */
async function navigateTabForward(tab) {
    
    // 检查是否可以前进
    if (tab.forwardStack.length === 0) {
        orca.notify("info", "[tabsman] 当前标签页历史已到末尾，无法前进");
        return false;
    }
    
    // 从前进栈刚才放入的项放回后退栈栈顶
    const item = tab.forwardStack.pop();
    tab.backStack.push(item);
    
    // 导航到取出的项，并更新当前的tab信息
    orca.nav.replace(item.view, item.viewArgs, item.sourcePanelId);
    await updateTabProperties()
    
    return true;
}

// ==================== 标签页增、删、切换 ====================

/**
 * 为新面板创建初始标签页和访问历史
 * @param {string} [panelId] - 面板ID
 * @param {boolean} [needRender] - 是否需要立刻渲染
 * @returns {Promise<Object>} - 返回创建的tab
 */
async function createTabForNewPanel(panelId, needRender = true) {

    // 确保面板存在并且是focus状态
    if (!panelId) return
    const panel = orca.nav.findViewPanel(panelId, orca.state.panels);
    if (!panel) return
    orca.nav.switchFocusTo(panelId);

    const {view, viewArgs} = panel
    const currentBlockId = getBlockIdByViewAndViewArgs(view, viewArgs)
    const tab = await createTab({ currentBlockId, panelId, needRender, initHistoryInfo: {view, viewArgs} });
    return tab
}

/**
 * 专门创建标签页对象并载入core数据结构，不负责tab跳转
 * @param {number} [currentBlockId] - tab当前块ID
 * @param {string} [panelId] - 面板ID（可选，默认当前活跃面板）
 * @param {boolean} [needRender] - 是否需要立刻渲染（可选，默认true）
 * @param {Object} [initHistoryInfo] - 必需的初始访问历史信息对象，包含view和viewArgs属性，用于指定标签页的初始历史记录
 * @returns {Promise<Object>} 返回新创建的标签页对象
 */
async function createTab({ currentBlockId, panelId = orca.state.activePanel, needRender = true, initHistoryInfo } = {}) {
    // 查询是否为日志块，是就使用date替换currentBlockId，确保以journal视图跳转
    if (typeof currentBlockId === 'number' && currentBlockId > 0) {
        const block = await orca.invokeBackend("get-block", currentBlockId);
        if (!block) {
            orca.notify("info",`[tabsman] 目标块${currentBlockId}已删除，现重定向为今日日志`)
            currentBlockId = new Date(new Date().toDateString());
        }

        // 查找_repr属性来判断是否为日志块
        if (block && block.properties) {
            const blockProperty_repr = block.properties.find(prop => prop.name === '_repr');
            if (blockProperty_repr?.value?.type === 'journal') {
                currentBlockId = blockProperty_repr.value.date;
            }
        }
    }
    
    // 创建标签页对象并填充初始历史
    const tab = createTabObject(currentBlockId, panelId, "", "")
    await __checkTabCurrentBlockId(tab)
    const {name, icon} = await generateTabNameAndIcon(tab.currentBlockId);
    tab.name = name
    tab.currentIcon = icon
    // 填充初始历史，如果没有传入initHistoryInfo则不填充
    if (!initHistoryInfo) {
        orca.notify("error", "[tabsman] createTab函数缺少initHistoryInfo参数，已中断创建流程，请联系插件开发者修复此问题");
        return;
    }
    const {view, viewArgs} = initHistoryInfo
    const historyItem = {icon, name, sourcePanelId: panelId, view, viewArgs}
    tab.backStack.push(historyItem)
    
    // tab登记到core数据结构中
    tabs[tab.id] = tab;
    if (!tabIdSetByPanelId.has(panelId)) {
        tabIdSetByPanelId.set(panelId, new Set());
    }
    tabIdSetByPanelId.get(panelId).add(tab.id);
    
    // 更新排序缓存
    updateSortedTabsCache(panelId);
    
    // 如果该面板只有一个标签页，自动设置为活跃状态
    if (tabIdSetByPanelId.get(panelId).size === 1) {
        tab.isActive = true;
        tab.lastAccessedTs = Date.now();
        activeTabs[panelId] = tab;
    }

    if (renderTabsCallback && needRender) await renderTabsCallback({type:"create", currentTab: tab});

    return tab;
}

/**
 * 切换标签页
 * @param {string} tabId - 标签页ID
 * @param {boolean}  needRender - 是否需要渲染UI，false则不会渲染，这一般是其他函数借用该函数来切换到上一个活跃tab。
 * @returns {Promise<void>}
 */
async function switchTab(tabId, needRender = true) {
    const tab = tabs[tabId];

    // 不存在tab，不处理
    if (!tab) return

    const activePanelId = orca.state.activePanel
    const currentTab = activeTabs[activePanelId]

    // tab就是当前面板的当前tab，则无需其他处理
    if (currentTab === tab) return

    // 更新旧tab信息
    await updateTabProperties()

    // 重新标记活跃tab
    const {panelId} = tab
    const activeTab = activeTabs[panelId]
    activeTab.isActive = false
    tab.isActive = true
    tab.lastAccessedTs = Date.now();
    activeTabs[panelId] = tab
    
    if (panelId !== activePanelId) orca.nav.switchFocusTo(panelId);

    // 使tab的目标id是确保有效的，如果无效了（被删除了），则重定向为今日日志
    await __checkTabCurrentBlockId(tab)

    // 切换tab
    if (needRender && renderTabsCallback) await renderTabsCallback({type:"switch", currentTab: tab , previousTab: activeTab});

    // 替换成新tab，并更新tab信息
    const {view, viewArgs} = getViewAndViewArgsByTab(tab)
    orca.nav.replace(view, viewArgs, panelId)
    await updateTabProperties()

    // 目标tab从未打开过则填充一次当前历史
    if (tab.backStack.length === 0) await fillCurrentAccess()
}


/** 
 * 返回上一次的activeTab，如果最后的lastAccessedTs == 0，则中止切换。
 * @param {string} panelId - 面板ID
 * @param {boolean}  needRender - 是否需要渲染UI，false则不会渲染，这一般是其他函数借用该函数来切换到上一个活跃tab。
*/
async function switchPreviousActiveTab(panelId, needRender = true) {
    let previewActiveTab;
    for (const tab of getOneSortedTabs(panelId)) {
        if (tab.isActive) continue
        const isNewestActiveTab = !previewActiveTab || tab.lastAccessedTs > previewActiveTab.lastAccessedTs
        if (isNewestActiveTab) previewActiveTab = tab
    }
    if (previewActiveTab.lastAccessedTs === 0) return false
    await switchTab(previewActiveTab.id, needRender)
    return true
}


/**
 * 删除标签页
 * @param {string} tabId - 标签页ID
 * @returns {Promise<void>}
 */
async function deleteTab(tabId) {
    const tab = tabs[tabId];

    // 不存在tab
    if (!tab) return

    // 整个只有唯一tab，不允许删除
    if (Object.getOwnPropertyNames(tabs).length === 1) {
        orca.notify("warn", "[tabsman] 系统中只有一个标签页，无法删除");
        return
    }

    // 【持久化处理】保存删除的标签页到最近关闭
    await TabsmanPersistence.addAndSaveTab(tab, "recently-closed");    
    // 【持久化处理】如果是置顶标签页，且不在工作区，则从持久化数据中移除
    if (tab.isPinned && workspaceNow === "") await TabsmanPersistence.removeAndSaveTab(tab, "pinned")

    // 如果即将删除的tab所处面板只有一个标签页，直接关闭面板并刷新ui
    const {panelId} = tab
    const tabIdSet = tabIdSetByPanelId.get(panelId)
    if (tabIdSet.size === 1) {
        navOriginals.method.close.call(navOriginals.thisValue, panelId) // orca全局历史订阅回调已处理：关闭行为而触发的orca全局历史减少，不会引起tab历史填充。
        
        // 清理UI再清除数据
        if (renderTabsCallback) await renderTabsCallback({type: "closePanel", panelId});
        
        delete tabs[tabId]
        tabIdSetByPanelId.delete(panelId)
        delete activeTabs[panelId]
        sortedTabsByPanelId.delete(panelId)
        return
    }

    // 如果删的是活跃tab，就先切换到下一个符合期望的Tab
    if (activeTabs[panelId] === tab) await __switchTabBeforeDelete(panelId, tabId);

    // 清理关闭的标签页数据并更新排序缓存，再次刷新UI
    delete tabs[tabId]
    tabIdSet.delete(tabId)
    updateSortedTabsCache(panelId)
    if (renderTabsCallback) await renderTabsCallback({type: "delete", currentTab: activeTabs[panelId], previousTab: tab})
}


// 辅助函数，当一个tab准备从面板中被移出前，调用该函数可切换到符合期望的tab上。
// 先检查是否存在上一个访问过的活跃tab，如果没有，则根据位置给出新tab，是0就给1，否则就给上一个，以维持选中位置的不变。
async function __switchTabBeforeDelete(panelId, activeTabId) {
    const existPreviousActiveTab = await switchPreviousActiveTab(panelId, false)
    if (!existPreviousActiveTab) {
        const activeTabIndex = getOneSortedTabs(panelId).findIndex(tab => tab.id === activeTabId);
        const newIndex  = activeTabIndex === 0 ? 1 : activeTabIndex - 1;
        const newTab = getOneSortedTabs(panelId)[newIndex];
        await switchTab(newTab.id, false)
    }
}


// 移动tab到其他面板
async function moveTabToPanel(tabId, newPanelId) {

    const tab = tabs[tabId];
    const oldPanelId = tab.panelId;

    if (tab.panelId === newPanelId) return false;
    if (!tabIdSetByPanelId.has(newPanelId) || !tabs[tabId]) {
        orca.notify("error", `[tabsman] 目标面板或标签页不存在，无法移动。`);
        return false;
    }

    // 将tab数据复制一份到新面板
    tab.panelId = newPanelId;
    tabIdSetByPanelId.get(newPanelId).add(tabId);
    updateSortedTabsCache(newPanelId);

    // 如果被移走的是唯一一个标签页，则先清UI，再清理数据库数据（UI清理需要读取数据库）。
    if (tabIdSetByPanelId.get(oldPanelId).size === 1) {
        if (renderTabsCallback) await renderTabsCallback({type: "closePanel", panelId: oldPanelId});
        delete activeTabs[oldPanelId];
        tabIdSetByPanelId.delete(oldPanelId);
        sortedTabsByPanelId.delete(oldPanelId);
        
        navOriginals.method.close.call(navOriginals.thisValue, oldPanelId)
        return true;
    }

    // 如果被移走的是active面板的active-tab，则先执行switchTab。
    if (tab.isActive) await __switchTabBeforeDelete(oldPanelId, tabId);
    
    // 将tab数据从旧面板移除并刷新UI
    tabIdSetByPanelId.get(oldPanelId).delete(tabId);
    const sortedTabs = getOneSortedTabs(oldPanelId)
    const index = sortedTabs.findIndex(tab => tab.id === tabId)
    if (index !== -1) sortedTabs.splice(index, 1);
    if (renderTabsCallback) await renderTabsCallback();
    return true;
}


/**
 * 置顶标签页
 * @param {string} tabId - 标签页ID
 * @returns {Promise<boolean>} 返回是否成功
 */
async function pinTab(tabId) {
    const tab = tabs[tabId];
    if (!tab) {
        console.warn(`[tabsman] 尝试置顶不存在的标签页: ${tabId}`);
        return false;
    }
    
    // 设置置顶状态
    tab.isPinned = true;
    tab.pinTs = Date.now();
    
    // 更新排序缓存
    const {panelId} = tab
    updateSortedTabsCache(panelId);

    // 通知UI更新（置顶标签页会改变排序，需要重新渲染标签页列表）
    if (renderTabsCallback) await renderTabsCallback({type: "pin", panelId});
    
    // 持久化
    // 2025-11-23 不在工作区时，持久化处理。在工作区不需要，因为工作区自带持久化
    if (workspaceNow === "") await TabsmanPersistence.addAndSaveTab(tab, "pinned")
    return true;
}

/**
 * 取消置顶标签页
 * @param {string} tabId - 标签页ID
 * @returns {Promise<boolean>} 返回是否成功
 */
async function unpinTab(tabId) {
    const tab = tabs[tabId];
    if (!tab) {
        console.warn(`[tabsman] 尝试取消置顶不存在的标签页: ${tabId}`);
        return false;
    }
    
    if (!tab.isPinned) {
        console.log(`[tabsman] 标签页 ${tabId} 未置顶`);
        return true;
    }
    
    // 取消置顶状态
    tab.isPinned = false;
    tab.pinTs = 0;
    
    const {panelId} = tab
    // 更新排序缓存
    updateSortedTabsCache(panelId);

    // 通知UI更新（取消置顶标签页会改变排序，需要重新渲染标签页列表）
    if (renderTabsCallback) await renderTabsCallback({type: "pin", panelId});
    
    // 移除对应数据
    // 2025-11-23 不在工作区时，持久化处理。在工作区不需要，因为工作区自带持久化
    if (workspaceNow === "") await TabsmanPersistence.removeAndSaveTab(tab, "pinned")
    return true;
}


/* ————————————————————————————————————————————————————————————————————————————————————————————————— */
/* ———————————————————————————————————————实现工作区————————————————————————————————————————————————— */
/* ————————————————————————————————————————————————————————————————————————————————————————————————— */
// 获取面板位置
function getPanelScrollInfo() {
    const panelIds = Object.keys(activeTabs)
    const scrollInfo = {}
    for(const panelId of panelIds) {
        const panelViewState = orca.nav.findViewPanel(panelId, orca.state.panels).viewState
        const rootBlockId = Object.keys(panelViewState).find(key => !isNaN(Number(key)))
        // 一些插件渲染出来块可能不具备完整的viewState
        scrollInfo[panelId] = panelViewState[rootBlockId]?.scrollTop
    }
    return scrollInfo
}

// 保存工作空间
async function saveWorkspace(name, onlyActiveTab = false){
    const sname = String(name)
    // 时间戳前缀用于排序（getDataKeys获取的数组是按照keys的码值排序的）
    // 只禁止恶意重名：一个时间戳内连续生成相同name
    const saveName = String(Date.now()) + "_" + sname

    const existName = await orca.plugins.getData('tabsman-workspace', saveName)
    if (existName || existName === "tabsman-workspace-exit"){
        orca.notify("info", "[tabsman]name已存在。另外，name不可使用tabsman-workspace-exit");
        return ""
    }

    if (onlyActiveTab) {
        const tab = activeTabs[orca.state.activePanel]
        const tabsNew = {}
        tabsNew[tab.id] = tab;
        await orca.plugins.setData('tabsman-workspace', saveName, JSON.stringify(tabsNew));

    } else {
        await orca.plugins.setData('tabsman-workspace', saveName, JSON.stringify(tabs));
        await orca.plugins.setData('tabsman-workspace-scroll', saveName, JSON.stringify(getPanelScrollInfo()));
    }

    orca.notify("success", "[tabsman]新工作区创建成功！");
    return saveName
}

// 显示所有的工作空间name
async function getAllWorkspace(){
    const keys = await orca.plugins.getDataKeys("tabsman-workspace")

    return keys
}

// 删除指定name的工作空间，返回值1用于删除时是否正处于该工作区
async function deleteWorkspace(name) {
    const sname = String(name)
    await orca.plugins.removeData("tabsman-workspace", sname)
    await orca.plugins.removeData("tabsman-workspace-scroll", sname)
    orca.notify("success", "[tabsman]工作区删除成功");
    // 正在工作区就先退出
    if (workspaceNow === sname) {
        exitWorkspace()
        return 1
    }
    return 0
}

// 删除所有的工作空间
function deleteAllWorkspace() {
    // 正在工作区就先退出
    if (workspaceNow !== "") exitWorkspace()
    orca.plugins.clearData("tabsman-workspace")
    orca.plugins.clearData("tabsman-workspace-scroll")
}

// 退出当前工作空间
function exitWorkspace() {
    openWorkspace()
}

// 打开工作空间
let workspaceNow = ""
// 标记正在切换工作空间
let workspaceSwitching = false
// 参数默认值为退出点
async function openWorkspace(name = ""){
    const sname = String(name)
    // 如果当前打开的就是目标工作区，则跳过。
    if (workspaceNow === sname) {
        orca.notify("info", "[tabsman]当前已在该工作空间")
        return
    }
    
    // 读取目标工作区的tabs的JSON数据
    const workspaceTabsJSON = await orca.plugins.getData('tabsman-workspace', sname ? sname : "tabsman-workspace-exit");
    if (!workspaceTabsJSON) {
        orca.notify("info", "[tabsman]目标工作区数据不存在")
        return
    }

    // 维护退出点数据
    if (workspaceNow === "") {
        await orca.plugins.setData('tabsman-workspace', "tabsman-workspace-exit", JSON.stringify(tabs));
        await orca.plugins.setData('tabsman-workspace-scroll', "tabsman-workspace-exit", JSON.stringify(getPanelScrollInfo()));
    } else if (sname === "") {
        // 丢弃过时的退出点
        await orca.plugins.removeData("tabsman-workspace", "tabsman-workspace-exit")
        await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
    } else if (sname) {
        await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
    }
    workspaceNow = sname

    // 恢复工作区tabs数据
    let workspaceTabs = {};
    let workspaceActiveTabs = {};
    let workspaceTabIdSetByPanelId = new Map();
    const workspaceTabsValue = TabsmanPersistence.wakeTabArray(Object.values(JSON.parse(workspaceTabsJSON)), "workspace");
    for (const tab of workspaceTabsValue) {
        const tabId = tab.id
        const tabPanelId = tab.panelId

        // 构建工作区tabs
        workspaceTabs[tabId] = tab

        // 构建工作区activeTabs
        if (tab.isActive) {
            workspaceActiveTabs[tabPanelId] = tab
            tab.lastAccessedTs = Date.now()
        }

        // 构建工作区TabIdSetByPanelId
        if (!workspaceTabIdSetByPanelId.has(tabPanelId)) {
            workspaceTabIdSetByPanelId.set(tabPanelId, new Set())
        }
        workspaceTabIdSetByPanelId.get(tabPanelId).add(tabId)
    }
    tabs = workspaceTabs
    activeTabs = workspaceActiveTabs
    tabIdSetByPanelId = workspaceTabIdSetByPanelId


    // 临时面板, 用作创建新面板的坐标
    workspaceSwitching = true
    const tmp = navOriginals.method.addTo.call(navOriginals.thisValue, orca.state.activePanel, "right")
    orca.nav.closeAllBut(tmp)

    // 遍历activetab以准备新面板
    const activeTabsValue = Object.values(activeTabs);
    const tabsValue = Object.values(tabs);
    const newPanelIds = []
    // 清除旧的排序缓存
    sortedTabsByPanelId.clear()
    for (const tab of activeTabsValue) {
        await __checkTabCurrentBlockId(tab)

        // 准备新面板
        const {view, viewArgs} = getViewAndViewArgsByTab(tab)
        const viewpanel = { view, viewArgs, viewState: {} }
        const newPanelId = navOriginals.method.addTo.call(navOriginals.thisValue, orca.state.activePanel, "left", viewpanel)
        newPanelIds.push(newPanelId)
        
        // 将数据结构中旧面板id更新为新面板
        const oldPanelId = tab.panelId
        activeTabs[newPanelId] = tab
        delete activeTabs[oldPanelId]
        tabIdSetByPanelId.set(newPanelId, tabIdSetByPanelId.get(oldPanelId))
        tabIdSetByPanelId.delete(oldPanelId)

        // 更新该面板所有tab对象的面板id
        tabsValue.forEach(tab => {
            if (tab.panelId === oldPanelId) tab.panelId = newPanelId
        })

        // 更新排序
        updateSortedTabsCache(newPanelId)

        // 滚动到上次打开的位置
        const workspaceScrollJSON = await orca.plugins.getData('tabsman-workspace-scroll', sname ? sname : "tabsman-workspace-exit")
        if (workspaceScrollJSON) {
            const workspaceScroll = JSON.parse(workspaceScrollJSON)
            const topValue = workspaceScroll[oldPanelId]
            if (topValue){
                const selector = ".orca-panel[data-panel-id='" + newPanelId + "']>.orca-hideable>.orca-block-editor"
                setTimeout(() => {
                    const scrollContainer = document.querySelector(selector)
                    scrollContainer.scrollTo({
                        top: topValue,
                        behavior: 'smooth'
                    });
                }, 500);
            }
        }
    }

    navOriginals.method.close.call(navOriginals.thisValue, tmp)

    if (renderTabsCallback) await renderTabsCallback();

    setTimeout(() => workspaceSwitching = false, 0);
}

/* ———————————————————————————————————————————— 明细业务功能 —————————————————————————————————————————————————————— */

// 创建今日日志Tab
async function createTodayJournalTab(panelId) {
    if (!panelId) orca.notify("error", "[tabsman] createQuickNoteTab函数缺少panelId参数，已中断创建流程，请联系插件开发者修复此问题");
    const today = new Date(new Date().toDateString());
    const initHistoryInfo = {view: "journal", viewArgs: {date: today}};
    const newTab = await createTab({currentBlockId: today, panelId, initHistoryInfo})
    await switchTab(newTab.id)
}

// 创建快速记录Tab
async function createQuickNoteTab(panelId) {
    if (!panelId) orca.notify("error", "[tabsman] createQuickNoteTab函数缺少panelId参数，已中断创建流程，请联系插件开发者修复此问题");
    const {quickNoteBlockId, isNewBlock} = await getQuickNoteBlockId()
    if (!isNewBlock) orca.notify("info", "[tabsman] 日志末尾已存在空块，直接使用");
    const newTab = await createTab({currentBlockId: quickNoteBlockId, panelId, initHistoryInfo: {view: "block", viewArgs: {blockId: quickNoteBlockId}}})
    await switchTab(newTab.id)

    // 根据用户设置决定是否启用自动折叠上一个快速记录块的功能（如果存在上一个快速记录块）
    if (enableAutoFoldQuickNotes && lastQuickNoteBlockId) {
        orca.commands.invokeEditorCommand("core.editor.foldBlock", null, lastQuickNoteBlockId);
    }

    // 根据用户设置决定是否启用快速记录块前缀功能，如果启用则在新建的快速记录块内添加日期前缀，并将光标移动到前缀后面
    if (enableQuickNotePrefix) {
        const date = new Date();
        const y = date.getFullYear() - 2000
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        const prefix = prefixString + y + m + d

        const updates = [{ id: quickNoteBlockId, content: [{ t: "t", v: prefix }] }]
        await orca.commands.invokeEditorCommand(
            "core.editor.setBlocksContent",
            null,
            updates,
            false,
        )

        setTimeout((length = prefix.length) => {
            const cursorData = __getCursorData(quickNoteBlockId, panelId)
            // 光标给到日期前缀末尾
            cursorData.anchor.offset = length
            cursorData.focus.offset = length
            orca.utils.setSelectionFromCursorData(cursorData);
        }, 0);
    }

    // 保存快速记录块id，以便下次创建快速记录时进行自动折叠处理（根据用户设置决定是否启用自动折叠）
    lastQuickNoteBlockId = quickNoteBlockId;
}


// 辅助函数，获取有效的cursorData，如果无法获取，则使用预设数据替代（预设数据的块id和面板id会被替换成当前快速记录块和面板）
function __getCursorData(quickNoteBlockId, panelId) {
    // 用于在无法获取cursorData时，直接生成cursorData。典型的无法获取场景就是白板中创建快速记录tab。
    const cursorDataTemplate = {  
        anchor: {blockId: 20260416, isInline: true, index: 0, offset: 0},
        focus: {blockId: 20260416, isInline: true, index: 0, offset: 0},
        isForward: true,
        panelId: "当前虎鲸版本1.72.0",
        rootBlockId: 20260416
    };
    const selection = window.getSelection();
    let cursorData = orca.utils.getCursorDataFromSelection(selection);
    if (!cursorData) {
        cursorData = cursorDataTemplate
        cursorData.anchor.blockId = quickNoteBlockId
        cursorData.focus.blockId = quickNoteBlockId
        cursorData.panelId = panelId
        cursorData.rootBlockId = quickNoteBlockId
        console.log("[tabsman] 无法获取cursorData，已使用预设数据替代，可能会导致光标位置不准确", cursorData);
    }
    return cursorData;
}


// 在今日日志末尾获取一个空块id（若连续2个空块，则不新建，直接采用最后一个）
async function getQuickNoteBlockId(){
    const todayDate = new Date()
    const today = await orca.invokeBackend("get-journal-block", todayDate)
    const todayChildren = today.children

    // 需要插入的新空块数量
    let newBlockNumber;

    const todayChildrenLen = todayChildren.length
    if (todayChildrenLen === 0) {
        newBlockNumber = 1
    } else {
        // last空块检查
        const lastChildrenId = todayChildren[todayChildrenLen - 1]
        const lastBlock = await orca.invokeBackend("get-block", lastChildrenId)
        const isEmptyTextBlock = lastBlock.text === null && lastBlock.properties.find(p => p.name === '_repr').value.type === "text"

        if (!isEmptyTextBlock) {
            newBlockNumber = 2
        } else if (todayChildrenLen === 1) {
            newBlockNumber = 0
            return {quickNoteBlockId: lastChildrenId, isNewBlock: false}
        } else {
            // 倒数第二个空块检查
            const last2ChildrenId = todayChildren[todayChildrenLen - 2]
            const last2Block = await orca.invokeBackend("get-block", last2ChildrenId)
            const isEmptyTextBlock = last2Block.text === null && last2Block.properties.find(p => p.name === '_repr').value.type === "text"
            
            if (isEmptyTextBlock) {
                newBlockNumber = 0
                return {quickNoteBlockId: lastChildrenId, isNewBlock: false}
            } else {
                newBlockNumber = 1
            }
        }
    }
    
    let quickNoteBlockId;
    await orca.commands.invokeGroup(async () => {
        for (let i = 0; i < newBlockNumber; i++) {
            quickNoteBlockId = await orca.commands.invokeEditorCommand(
                "core.editor.insertBlock",
                null,
                await orca.invokeBackend("get-journal-block", todayDate), // 必须重新查询，不然插入位置是过时的
                "lastChild",
                null, // 用于 block.text = null ，使得内容为空。如果需要自定义内容，则 [{ t: "t", v: "自定义文本内容" }]
                { type: "text" },
            )
        }
    })
    return {quickNoteBlockId, isNewBlock: true}
}

/* —————————————————————————————————————————————————————————————————————————————————————————————————— */



/**
 * 切换到下一个标签页
 * @returns {Promise<boolean>} 返回是否切换成功
 */
async function switchToNextTab() {
    const activePanelId = orca.state.activePanel;

    const panelTabs = getOneSortedTabs(activePanelId);
    if (panelTabs.length <= 1) {
        orca.notify("info", "[tabsman] 当前面板只有一个标签页");
        return false;
    }
    
    const activeTab = activeTabs[activePanelId];
    if (!activeTab) {
        orca.notify("warn", "[tabsman] 无法获取当前活跃标签页");
        return false;
    }
    
    // 找到当前标签页在列表中的位置
    const currentIndex = panelTabs.findIndex(tab => tab.id === activeTab.id);
    if (currentIndex === -1) {
        orca.notify("warn", "[tabsman] 当前标签页不在列表中");
        return false;
    }
    
    // 计算下一个标签页的索引（循环到第一个）
    const nextIndex = (currentIndex + 1) % panelTabs.length;
    const nextTab = panelTabs[nextIndex];
    
    return switchTab(nextTab.id);
}

/**
 * 切换到上一个标签页
 * @returns {Promise<boolean>} 返回是否切换成功
 */
async function switchToPreviousTab() {
    const activePanelId = orca.state.activePanel;
    
    const panelTabs = getOneSortedTabs(activePanelId);
    if (panelTabs.length <= 1) {
        orca.notify("info", "[tabsman] 当前面板只有一个标签页");
        return false;
    }
    
    const activeTab = activeTabs[activePanelId];
    if (!activeTab) {
        orca.notify("warn", "[tabsman] 无法获取当前活跃标签页");
        return false;
    }
    
    // 找到当前标签页在列表中的位置
    const currentIndex = panelTabs.findIndex(tab => tab.id === activeTab.id);
    if (currentIndex === -1) {
        orca.notify("warn", "[tabsman] 当前标签页不在列表中");
        return false;
    }
    
    // 计算上一个标签页的索引（循环到最后一个）
    const prevIndex = currentIndex === 0 ? panelTabs.length - 1 : currentIndex - 1;
    const prevTab = panelTabs[prevIndex];

    return switchTab(prevTab.id);
}




// ==================== 命令拦截 ====================
/**
 * 拦截Orca的核心导航命令和面板创建API和关闭API
 */
function setupCommandInterception() {
    beforeCommandHooks = {}
    
    // 1. 拦截后退命令
    beforeCommandHooks.goBack = (cmdId, ...args) => {
        const activePanelId = orca.state.activePanel;
        if (!activePanelId) return false;
        
        const activeTab = activeTabs[activePanelId];
        if (!activeTab) return false;
        
        // 使用标签页历史后退
        navigateTabBack(activeTab);
        return false; // 阻止原始命令执行
    };
    
    // 2. 拦截前进命令
    beforeCommandHooks.goForward = (cmdId, ...args) => {
        const activePanelId = orca.state.activePanel;
        if (!activePanelId) return false;
        
        const activeTab = activeTabs[activePanelId];
        if (!activeTab) return false;
        
        // 使用标签页历史前进
        navigateTabForward(activeTab);
        return false; // 阻止原始命令执行
    };
    
    // 【废弃，已对nav.close进行了包装】3. 拦截 core.closePanel 命令（关闭当前面板）
    
    // 4. 拦截 core.closeOtherPanels 命令（关闭除当前面板外的所有面板）
    beforeCommandHooks.closeOtherPanels = async () => {
        const activePanelId = orca.state.activePanel;
        
        // 清理除当前面板外的所有面板的标签页数据
        for (const [panelId, tabIdSet] of tabIdSetByPanelId) {
            if (panelId !== activePanelId) {
                // 删除该面板的所有标签页数据
                tabIdSet.forEach(tabId => {
                    delete tabs[tabId];
                });
                tabIdSetByPanelId.delete(panelId);
                delete activeTabs[panelId];
                sortedTabsByPanelId.delete(panelId);
            }
        }
        
        return true; // 允许命令继续执行
    };

    Object.keys(beforeCommandHooks).forEach(name=>orca.commands.registerBeforeCommand(`core.${name}`, beforeCommandHooks[name]))


    afterCommandHooks = {
        // async closePanel(){ if (renderTabsCallback) await renderTabsCallback()},
        async closeOtherPanels(){ if (renderTabsCallback) await renderTabsCallback()}
    }
    Object.keys(afterCommandHooks).forEach(name=>orca.commands.registerAfterCommand(`core.${name}`, afterCommandHooks[name]))
}

// 清理命令拦截
function cleanCommandInterception(){
    Object.keys(beforeCommandHooks).forEach(name => orca.commands.unregisterBeforeCommand(`core.${name}`, beforeCommandHooks[name]))
    Object.keys(afterCommandHooks).forEach(name=>orca.commands.unregisterAfterCommand(`core.${name}`, afterCommandHooks[name]))

    beforeCommandHooks = null
    afterCommandHooks = null
}


// 包装所需要的nav函数
function setupNavWrappers() {
    // 初始化
    navOriginals = {
        thisValue: orca.nav,
        method: {
            addTo: null,
            openInLastPanel: null,
            goTo: null
        }
    }
    
    // 包装 orca.nav.goTo 以支持 Ctrl+点击创建后台标签页，且确保始终是当前面板跳转
    navOriginals.method.goTo = orca.nav.goTo
    orca.nav.goTo = function(view, viewArgs, panelId) {
        // 如果没传panelId，或者传了个未被记录的panelId，则panelId定向为当前UI上的activePanelId
        if (!panelId || !Object.hasOwn(activeTabs, panelId)) {
            panelId = document.querySelector('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active').dataset.tabsmanPanelId;
        }

        // activePanel切换到panelId上，以便在插件或官方黑盒中调用到orca.state.activePanel的地方可以正确跳转和填充历史。  
        // 典型场景：官方在全局搜索视图中打开预览编辑，在里面跳转将会无效。下方switch之后，就可以正常跳转。
        if (orca.state.activePanel !== panelId) orca.nav.switchFocusTo(panelId);

        // 处理Ctrl+Click（未按shift）：创建后台标签页
        if (window.event?.ctrlKey && !window.event.shiftKey && window.event.button === 0) {
            // 根据视图类型确定目标内容ID
            const targetBlockId = getBlockIdByViewAndViewArgs(view, viewArgs);
            createTab({ currentBlockId: targetBlockId, panelId, initHistoryInfo: { view, viewArgs } })
            .then(() => orca.notify("success", "[tabsman] 已创建后台标签页"))

        } else if (window.event?.ctrlKey && window.event.shiftKey && window.event.button === 0) {
            // 处理 Ctrl+Shift+Click：创建前台标签页
            orca.nav.openInLastPanel(view, viewArgs);

        } else {
            // 检查panelId是否locked，如果locked，则单独用openInLastPanel封装，不然UI渲染会有问题。
            const panel = orca.nav.findViewPanel(panelId, orca.state.panels);
            panel.locked
                ? orca.nav.openInLastPanel(view, viewArgs)
                : navOriginals.method.goTo.call(this, view, viewArgs, panelId)
        }   
    };
    
    // 包装 openInLastPanel API（空返回）
    navOriginals.method.openInLastPanel = orca.nav.openInLastPanel;
    orca.nav.openInLastPanel = function(view, viewArgs) {
        // 处理 Ctrl+Shift+Click：创建前台标签页
        if (window.event?.ctrlKey && window.event.shiftKey && window.event.button === 0) {
            const targetBlockId = getBlockIdByViewAndViewArgs(view, viewArgs);
            // 取当前UI上的activePanelId
            const panelId = document.querySelector('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active').dataset.tabsmanPanelId;
            const tabPromise  = createTab({ currentBlockId: targetBlockId, panelId, initHistoryInfo: { view, viewArgs } })
            tabPromise
                .then(newTab => switchTab(newTab.id))
                .then(() => orca.notify("success", "[tabsman] 已创建前台标签页"))
            
        } else if (window.event?.ctrlKey && !window.event.shiftKey && window.event.button === 0) {
            // 处理 Ctrl+Click：创建后台标签页
            orca.nav.goTo(view, viewArgs);

        } else {
            // 调用原始函数前往面板
            navOriginals.method.openInLastPanel.call(this, view, viewArgs);
            
            // 如果还没有这个面板的标签页，则初始化一份默认的标签页
            const newPanelId = orca.state.activePanel;
            if (!tabIdSetByPanelId.has(newPanelId)) createTabForNewPanel(newPanelId);
        }
    };

    // 包装 addTo API
    navOriginals.method.addTo = orca.nav.addTo;
    orca.nav.addTo = function(id, dir, src) {
        const newPanelId = navOriginals.method.addTo.call(this, id, dir, src);
        if (newPanelId) createTabForNewPanel(newPanelId);
        return newPanelId;
    };

    // 包装orca.nav.close，转交给delete完成
    navOriginals.method.close = orca.nav.close;
    orca.nav.close = async function (id) {
        const tab = activeTabs[id];
        if (!tab) return

        deleteTab(tab.id)
    }
}

// 重置被包装的nav函数
function cleanNavWrappers() {
    const {thisValue: orcaNav, method: originalMethod} = navOriginals
    Object.keys(originalMethod).forEach(fnName => {
        if (originalMethod[fnName]) {
            orcaNav[fnName] = originalMethod[fnName]
            originalMethod[fnName] = null
        }
    })

    navOriginals = null
}


// ==================== 初始化和清理 ====================
/**
 * 启动标签页系统
 * 初始化历史订阅、命令拦截和当前面板的标签页
 */
async function start(callback = null, pluginName) {
    // console.log('\n=== [tabsman] tabsman管理器启动 ===');
    
    // 设置UI渲染回调函数
    // 2025年11月23日 适配工作区的更新
    renderTabsCallback = async (options) => {
        callback(options);
        // 进入具体工作空间后每次刷新ui都更新数据
        if (workspaceNow !== ""){
            await orca.plugins.setData('tabsman-workspace', workspaceNow, JSON.stringify(tabs));
            // await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
        }
    }

    setupNavWrappers()

    // 为启动时的初始面板创建标签页
    await createTabsForInitialPanels()
    
    // 设置面板后退历史
    subscribePanelBackHistory();
    
    // 设置命令拦截
    setupCommandInterception();

    // 恢复所有持久化数据（置顶标签页、收藏块、最近关闭标签页）
    await TabsmanPersistence.restorePersistedData()

    subscribeSettings(pluginName)

    // 暴露 get 函数到全局（调试）
    window.pluginTabsman.getActiveTabs = getActiveTabs;
    window.pluginTabsman.getTabIdSetByPanelId = getTabIdSetByPanelId;
    window.pluginTabsman.getOneSortedTabs = getOneSortedTabs;
    window.pluginTabsman.getAllSortedTabs = getAllSortedTabs;
    window.pluginTabsman.getAllWS = getAllWorkspace
    window.pluginTabsman.deleteWS = deleteWorkspace
    window.pluginTabsman.deleteAllWS = deleteAllWorkspace
    window.pluginTabsman.saveWS = saveWorkspace
    window.pluginTabsman.openWS = openWorkspace
    window.pluginTabsman.exitWS = exitWorkspace
    window.pluginTabsman.createQuickNoteTab = createQuickNoteTab
    window.pluginTabsman.createTodayJournalTab = createTodayJournalTab

    /* —————————————————————————————————————————-工作区————————————————————————————————————————————————— */
    // 每次启动时先重置退出点
    await orca.plugins.removeData("tabsman-workspace","tabsman-workspace-exit")
    WorkspaceRender.startWSRender()
    // const n = await orca.plugins.getData('tabsman-workspace-feature', 'last-workspace-name')
    // if (n) lastWorkspaceName = JSON.parse(n)
    // WorkspaceRender.startWSRender(lastWorkspaceName)
    /* ————————————————————————————————————————————————————————————————————————————————————————————————— */
}

/**
 * 销毁标签页系统
 * 清理所有订阅、全局变量和暴露的API
 */
function destroy() {
    // 清理订阅
    unsubscribeAll()

    // 清理全局状态
    tabs = {};
    tabCounter = 0;  // 重置计数器
    activeTabs = {};
    tabIdSetByPanelId.clear();
    sortedTabsByPanelId.clear();  // 清理排序缓存
    
    cleanNavWrappers()

    // 清理注册的命令
    orca.commands.unregisterCommand('tabsman.goToNextTab');
    orca.commands.unregisterCommand('tabsman.goToPreviousTab');
    
    // 注销命令拦截器
    cleanCommandInterception()
    
    // 清理UI渲染回调函数
    renderTabsCallback = null;

    WorkspaceRender.stopWSRender()
}


// ==================== 数据访问函数 ====================

function getTabIdSetByPanelId() {
    return tabIdSetByPanelId;
}

function getTab(tabId) {
    return tabs[tabId]
}

function getActiveTabs() {
    return activeTabs;
}

/**
 * Map映射：面板ID-排序Tab对象数组
 * @returns {Map<string, Array>}
 */
function getAllSortedTabs() {
    return sortedTabsByPanelId;
}

/**
 * 获取指定面板的一个排序标签页列表
 * @param {string} panelId
 * @returns {Array} 排序后的标签页列表
 */
function getOneSortedTabs(panelId) {
    // 如果缓存中没有，先更新缓存
    // if (!sortedTabsByPanelId.has(panelId)) {
    //     updateSortedTabsCache(panelId);
    // }
    return sortedTabsByPanelId.get(panelId) || [];
}

export {
    start,
    destroy,
    // 数据访问函数
    getTabIdSetByPanelId,
    getTab,
    getActiveTabs,
    getOneSortedTabs,
    getAllSortedTabs,
    // 核心操作函数
    createTab,
    createTabObject,
    deleteTab,
    switchTab,
    moveTabToPanel,
    // Pin功能函数
    pinTab,
    unpinTab,
    // 排序缓存函数
    updateSortedTabsCache,
    // 标签页信息生成函数
    generateTabNameAndIcon,
    // 标签页导航函数
    switchToNextTab,
    switchToPreviousTab,
    switchPreviousActiveTab,
    // 外部API，外部使用它导入tab进Core数据结构
    importTabToActivePanel
};
