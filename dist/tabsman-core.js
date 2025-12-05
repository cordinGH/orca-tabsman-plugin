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

// 导入持久化模块
import { addAndSaveTab, removeAndSaveTab, restoreTabs, restoreFavoriteBlocks, getFavoriteBlockArray, wakeTabArray } from './tabsman-persistence.js';
import * as WorkspaceRender from './tabsman-workspace.js'

// 创建持久化命名空间
const TabsmanPersistence = {
    addAndSaveTab,
    removeAndSaveTab,
    restoreTabs,
    restoreFavoriteBlocks,
    getFavoriteBlockArray,
    wakeTabArray
};

/**
 * 历史记录长度约束配置
 */
const HISTORY_CONFIG = {
    MAX_BACK_STACK: 31,    // 后退栈最大长度
    MAX_FORWARD_STACK: 30  // 前进栈最大长度
};

// ==================== 全局变量 ====================

// 标签页UI渲染回调函数
let renderTabsCallback = null;

// 保存原始API函数的全局变量
/** @type {Function|null} 原始的 orca.nav.addTo 函数 */
let originalAddTo = null;
/** @type {Function|null} 原始的 orca.nav.openInLastPanel 函数 */
let originalOpenInLastPanel = null;
/** @type {Function|null} 原始的 orca.nav.goTo 函数 */
let originalGoTo = null;

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


/**
 * 获取所有面板的当前内容ID
 * @returns {Object} 面板ID到当前内容ID的映射对象
 */
function getCurrentBlockIds() {
    const panelInfo = {};
    
    // 递归处理面板结构的辅助函数
    function processPanel(panel) {        
        // 如果是ViewPanel，获取其当前内容ID
        if (panel.view && panel.id) {
            let currentBlockId = null;
            
            if (panel.view === 'journal') {
                // 如果是journal视图，获取journal的日期
                currentBlockId = panel.viewArgs?.date;
            } else {
                currentBlockId = panel.viewArgs?.blockId;
            }
            
            panelInfo[panel.id] = currentBlockId;
            return;
        }
        
        // 如果有children数组，递归遍历
        if (panel.children) {
            for (const child of panel.children) {
                processPanel(child);
            }
        }
    }
    // 从 orca.state.panels 开始处理
    processPanel(orca.state.panels);
    
    return panelInfo;
}

// ==================== 状态管理变量 ====================

/** @type {Function|null} 订阅取消函数 */
let unsubscribe = null;

/** @type {boolean} 是否为内部导航操作标志（前进/后退/切换标签页） */
let isInternalNavigation = false;

// ==================== 标签页信息生成和更新 ====================

/**
 * 生成标签页的名称和图标（优化版本，避免重复API调用）
 * @param {string} blockId - 块ID
 * @returns {Promise<{name: string, icon: string}>} 返回包含名称和图标的对象
 */
async function generateTabNameAndIcon(blockId) {
    if (!blockId) {
        return { name: '新标签页', icon: 'ti ti-cube' };
    }

    // 如果是Date对象（journal视图），直接使用日期字符串
    if (blockId instanceof Date) {
        return { 
            name: blockId.toString().substring(0, 15), 
            icon: 'ti ti-calendar-smile' 
        };
    }

    try {
        const block = await orca.invokeBackend("get-block", blockId);

        const reprProperty = block.properties.find(p => p.name === '_repr');
        if (!reprProperty || !reprProperty.value) return { name: '新标签页', icon: 'ti ti-cube' };

        const blockType = reprProperty.value.type;
        
        // 生成名称
        let name = '新标签页';
        if (['ul', 'ol', 'text', 'heading', 'task'].includes(blockType)) {
            // 检查是否具有"显示为别名"
            // 如果没找到_asAlias，说明是默认状态（显示为别名）
            let showAlias = false;
            if (block.aliases.length != 0) {
                const asAliasProperty = block.properties.find(p => p.name === '_asAlias');   
                showAlias = asAliasProperty?asAliasProperty.value : true;
            }

            if (showAlias) {
                name = block.aliases[0];
            } else if (block.text) {
                name = block.text.substring(0, 30) + (block.text.length > 30 ? '...' : '');
            } else {
                name = `(${blockType})`;
            }
        } else {
            name = `(${blockType})`;
        }

        // 生成图标
        let icon = 'ti ti-cube';
        switch (blockType) {
            case 'heading':
                const headingLevel = reprProperty.value.level || 1;
                switch (headingLevel) {
                    case 1: icon = 'ti ti-h-1'; break;
                    case 2: icon = 'ti ti-h-2'; break;
                    case 3: icon = 'ti ti-h-3'; break;
                    case 4: icon = 'ti ti-h-4'; break;
                }
                break;
            case 'text': icon = 'ti ti-cube'; break;
            case 'ul': icon = 'ti ti-list'; break;
            case 'ol': icon = 'ti ti-list-numbers'; break;
            case 'task': icon = 'ti ti-checkbox'; break;
            case 'code': icon = 'ti ti-code'; break;
            case 'quote2': icon = 'ti ti-blockquote'; break;
            case 'image': icon = 'ti ti-photo'; break;
            case 'video': icon = 'ti ti-movie'; break;
            case 'whiteboard': icon = 'ti ti-chalkboard'; break;
            default: icon = 'ti ti-cube';
        }

        // 版本1.8.0，判断是否为标签从而覆盖icon，如果块有别名，但不在别名列表，则说明是标签，反之说明是别名块
        if (block.aliases.length != 0){
            const blockAlias = block.aliases[0];
            const blockId = block.id;
            const aliasBlockIdList = (await orca.invokeBackend("get-aliased-blocks", blockAlias, 0, 99999))[1];
            icon = aliasBlockIdList.includes(blockId) ? "ti ti-file" : "ti ti-hash"
        }
        

        return { name, icon };
    } catch (error) {
        console.error('[tabsman] 生成标签页信息失败:', error);
        return { name: '新标签页', icon: 'ti ti-cube' };
    }
}

/**
 * 更新当前活跃标签页的属性（块ID、名称、图标）
 * @returns {Promise<void>}
 */
async function updateTabProperties() {
    const activePanelId = orca.state.activePanel;
    const activeTab = activeTabs[activePanelId];
    if (!activeTab) return;
    
    const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);
    const isJournal = activePanel.view === 'journal';
    
    // 立即更新块ID
    if (isJournal) {
        activeTab.currentBlockId = activePanel.viewArgs?.date;
    } else {
        activeTab.currentBlockId = activePanel.viewArgs?.blockId;
    }
    
    try {
        // 等待获取名称和图标
        const tabInfo = await generateTabNameAndIcon(activeTab.currentBlockId);
        activeTab.name = tabInfo.name;
        activeTab.currentIcon = tabInfo.icon;

        // console.log(`[tabsman] 当前标签页 ${activeTab.id} 的属性已更新: 块ID: ${activeTab.currentBlockId}, 名称: ${activeTab.name}, 图标: ${activeTab.currentIcon}`);
        
        // 更新UI
        if (renderTabsCallback) renderTabsCallback();
    } catch (error) {
        console.error('[tabsman] 更新标签页属性失败:', error);
        // 设置默认值
        activeTab.name = '新标签页';
        activeTab.currentIcon = 'ti ti-cube';
        if (renderTabsCallback) renderTabsCallback();
    }
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
        isActive: false,

        // 当前显示块ID和图标
        currentBlockId: currentBlockId,
        currentIcon: icon,

        // Pin功能相关属性
        isPinned: false,        // 是否置顶
        pinOrder: 0,            // 置顶顺序（0表示未置顶，数字越大越靠顶部）


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
            if (a.isPinned && b.isPinned) return b.pinOrder - a.pinOrder;
            
            // 置顶的标签页排在前面
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            // 两个都没被置顶：越晚创建的索引越靠后，越靠近底部。
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    
    // 更新缓存
    sortedTabsByPanelId.set(panelId, panelTabs);
}


// ==================== 标签页历史记录管理 ====================

/**
 * 设置订阅
 * 监听全局历史变化，触发导航处理
 */
function setupSubscription() {
    const { subscribe } = window.Valtio;
    
    // 监听全局历史变化，触发导航处理
    let lastHistoryLength = orca.state.panelBackHistory.length;
    const backHistoryUnsubscribe = subscribe(orca.state.panelBackHistory, () => {

        // 切换工作区期间重置lastHistoryLength后直接return
        if (workspaceSwitching) {
            lastHistoryLength = 0
            return
        }

        const currentLength = orca.state.panelBackHistory.length;
        // 不处理历史记录被删除的情况（虎鲸1.41版本关闭面板会删除该面板的历史记录）
        if (currentLength >= lastHistoryLength) {
        // console.log(`[tabsman] ⭐️触发全局历史更新 - 上次长度: ${lastHistoryLength}, 本次长度: ${currentLength}`);
            handleHistoryChange();
            lastHistoryLength = currentLength;
        }
    });
    
    return [backHistoryUnsubscribe];
}


/**
 * 填充当前访问的历史记录到当前面板的活跃标签页（同步版本）
 * @returns {void}
 */
function fillCurrentAccess() {
    const activeTab = activeTabs[orca.state.activePanel];
    if (!activeTab) return;
    
    const activePanel = orca.nav.findViewPanel(orca.state.activePanel, orca.state.panels);
    
    // 创建 PanelHistory 对象
    const historyItem = {
        activePanel: activePanel.id,
        view: activePanel.view,
        viewArgs: activePanel.viewArgs
    };

    // 添加到tab的历史记录
    // 约束后退栈长度：如果达到最大值，先移除最旧元素
    if (activeTab.backStack.length >= HISTORY_CONFIG.MAX_BACK_STACK) {
        activeTab.backStack.shift(); // 移除最旧的历史记录
    }
    activeTab.backStack.push(historyItem);
    activeTab.forwardStack = []; // 清空前进栈

    // 如果是pinned标签页，就新开一个tab并跳转
    if (activeTab.isPinned === true && activeTab.backStack.length > 1) {
        navigateTabBack(activeTab)
        activeTab.backStack.pop()
        activeTab.forwardStack = []
        createTab(Object.values(historyItem.viewArgs)[0], true);
    }
    
    // console.log(`[tabsman] 当前标签页 ${activeTab.id} 的访问记录已更新: 后退栈长度${activeTab.backStack.length}（包含当前访问）, 前进栈长度${activeTab.forwardStack.length}`);
}

/**
 * 因为拦截了前进/后退命令，使得前进后退只会在插件tab历史中操作，所以全局历史只会不断增长后退历史，不会增长前进历史（永远为0）
 * 当完成页面变化后，orca全局历史会发生变化，此函数用来处理变化时的tab信息更新（tab历史、tab属性、ui）
 * @returns {void}
 */
function handleHistoryChange() {
    // 如果上一次是内部导航操作，重置标志并直接返回
    if (isInternalNavigation) {
        // console.log("[tabsman] 本次为内部导航操作，不会产生新的访问记录,无需填充")
        isInternalNavigation = false;
        updateTabProperties();
        return;
    }
    
    // 非内部导航则进行填充历史
    fillCurrentAccess();
    updateTabProperties();
}

/**
 * 在标签页历史中后退
 * @param {Object} tab - 标签页对象
 * @returns {Promise<boolean>} 返回是否成功后退
 */
async function navigateTabBack(tab) {
    // 标记为内部导航操作
    isInternalNavigation = true;
    
    // 检查是否可以后退
    if (tab.backStack.length <= 1) {
        orca.notify("info", "[tabsman] 当前标签页历史已到开头，无法后退");
        isInternalNavigation = false;
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
    
    // 导航到新的当前项
    orca.nav.goTo(newCurrent.view, newCurrent.viewArgs);
    
    // console.log(`[tabsman] 标签页后退: 后退栈长度${tab.backStack.length}, 前进栈长度${tab.forwardStack.length}`);
    
    return true;
}

/**
 * 在标签页历史中前进
 * @param {Object} tab - 标签页对象
 * @returns {Promise<boolean>} 返回是否成功前进
 */
async function navigateTabForward(tab) {
    // 标记为内部导航操作
    isInternalNavigation = true;
    
    // 检查是否可以前进
    if (tab.forwardStack.length === 0) {
        orca.notify("info", "[tabsman] 当前标签页历史已到末尾，无法前进");
        isInternalNavigation = false;
        return false;
    }
    
    // 从前进栈刚才放入的项放回后退栈栈顶
    const item = tab.forwardStack.pop();
    tab.backStack.push(item);
    
    // 导航到取出的项
    orca.nav.goTo(item.view, item.viewArgs);
        
    // console.log(`[tabsman] 标签页前进: 后退栈长度${tab.backStack.length}, 前进栈长度${tab.forwardStack.length}`);
    
    return true;
}

// ==================== 标签页增、删、切换 ====================

/**
 * 为新面板创建初始标签页和访问历史
 * @param {string} [panelId] - 面板ID，可选，默认当前活跃面板
 * @returns {Promise<void>}
 */
async function createTabForNewPanel(panelId) {
    if (panelId) {
        // 如果指定了面板ID，先切换过去
        orca.nav.switchFocusTo(panelId);
    }
    // 创建默认标签页（使用当前面板内容）
    await createTab(0, false);
    // 填充访问历史
    fillCurrentAccess();
}

/**
 * 创建标签页
 * @param {string|number|Date|0|-1} [currentBlockId=0] - 初始块ID（可选），传0则自动获取当前面板的块ID，传-1则创建今日日志标签页
 * @param {boolean} [needSwitch=true] - 是否切换到新创建的标签页（可选，默认切换）
 * @param {string} [panelId] - 面板ID（可选，默认当前活跃面板）
 * @returns {Promise<Object>} 返回新创建的标签页对象
 */
async function createTab(currentBlockId = 0, needSwitch = true, panelId = orca.state.activePanel) {
    // 如果传入-1，创建今日日志标签页，转一下字符串以确保从0点0分0秒开始
    if (currentBlockId === -1) currentBlockId = new Date(new Date().toDateString());

    // 如果传入0，自动获取指定面板的显示内容ID
    else if (currentBlockId === 0) {
        const panel = orca.nav.findViewPanel(panelId, orca.state.panels);
        
        if (panel?.view === 'journal') {
            currentBlockId = panel.viewArgs?.date;
        } else {
            currentBlockId = panel?.viewArgs?.blockId || null;
        }
    }
    
    // 如果是数字块ID，需要查询这个块是否是日志块，如果是日志块，则使用date替换currentBlockId，确保以journal视图跳转
    if (typeof currentBlockId === 'number' && currentBlockId > 0) {
        const block = await orca.invokeBackend("get-block", currentBlockId);
        // 查找_repr属性来判断是否为日志块
        if (block && block.properties) {
            const blockProperty_repr = block.properties.find(prop => prop.name === '_repr');
            if (blockProperty_repr && blockProperty_repr.value && blockProperty_repr.value.type === 'journal') {
                currentBlockId = blockProperty_repr.value.date;
            }
        }
    }
    
    // 创建标签页对象
    const tabInfo = await generateTabNameAndIcon(currentBlockId);
    const tab = createTabObject(currentBlockId, panelId, tabInfo.icon, tabInfo.name);
    
    // 登记标签页到扁平化结构
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
        activeTabs[panelId] = tab;
    }
    
    console.log(`[tabsman] 标签页对象创建成功: （ID: ${tab.id}），(名称：${tab.name})`);

    // 如果需要切换，则切换到新标签页，后续刷新也交给switch触发历史更新来刷新
    if (needSwitch) {
        await switchTab(tab.id);
    } else {
        // 通知UI渲染
        if (renderTabsCallback) renderTabsCallback();
    }

    return tab;
}

/**
 * 切换标签页
 * @param {string} tabId - 标签页ID
 * @returns {Promise<boolean>} 返回是否切换成功
 */
async function switchTab(tabId) {
    const tab = tabs[tabId];
    
    if (!tab) {
        console.warn(`[tabsman] 尝试切换不存在的标签页: ${tabId}`);
        return false;
    }

    // 获取标签页所属的面板ID和其活跃标签页
    const tabPanelId = tab.panelId;
    const activeTab = activeTabs[tabPanelId];

    // 切换到标签页所属的面板
    if (tabPanelId !== orca.state.activePanel) {
        orca.nav.switchFocusTo(tabPanelId);
    }

    if (activeTab === tab) {
        orca.notify("info", "[tabsman] 当前已在该标签页")
        return true;
    } else {
        // 重新标记活跃标签页
        activeTab.isActive = false;        
        tab.isActive = true;
        activeTabs[tabPanelId] = tab;
        // 标记为标签页切换操作，无需更新Tab历史栈
        isInternalNavigation = true;

        // 如果目标标签页和活跃标签页的当前块ID相同，后续不会触发goTo跳转，也就不会重置标志位，因此这里手动重置
        // 日期对象比较其字符串值是否为同一天。数字块ID直接比较是否相等。
        const isSameBlockId = (activeTab.currentBlockId instanceof Date && tab.currentBlockId instanceof Date) 
            ? activeTab.currentBlockId.toDateString() === tab.currentBlockId.toDateString()
            : activeTab.currentBlockId === tab.currentBlockId;
        
        if (isSameBlockId) {
            isInternalNavigation = false;
            
            // 由于没有执行goTo跳转，UI不会自动更新，需要手动刷新
            if (renderTabsCallback) renderTabsCallback();
        }
    }
    
    // 导航到标签页的当前内容
    const isJournal = tab.currentBlockId instanceof Date;
    orca.nav.goTo(
        isJournal ? 'journal' : 'block',
        isJournal ? { date: tab.currentBlockId } : { blockId: tab.currentBlockId },
        tab.panelId
    );

    // 目标tab从未打开则填充一次当前历史（内部导航不会触发历史填充）
    if (tab.backStack.length === 0) fillCurrentAccess()
    return true;
}

/**
 * 删除标签页
 * 如果删除的是活跃标签页：
 * 1.1. 如果有剩余标签页：激活第一个
 * 1.2. 如果没有剩余标签页：关闭面板
 * @param {string} tabId - 标签页ID
 * @returns {Promise<boolean>} 返回是否删除成功
 */
async function deleteTab(tabId) {
    const tab = tabs[tabId];
    if (!tab) {
        console.warn(`[tabsman] 尝试删除不存在的标签页: ${tabId}`);
        return false;
    }

    // 检查是否只有一个标签页，如果是则不允许删除
    const totalTabsCount = Object.keys(tabs).length;
    if (totalTabsCount <= 1) {
        orca.notify("warn", "[tabsman] 系统中只有一个标签页，无法删除");
        return false;
    }

    const tabPanelId = tab.panelId;
    const tabIdSet = tabIdSetByPanelId.get(tabPanelId);

    // 【持久化处理】保存删除的标签页到持久化模块
    await TabsmanPersistence.addAndSaveTab(tab, "recently-closed");    
    // 【持久化处理】如果是置顶标签页，且不在工作区，则从持久化数据中移除
    if (tab.isPinned && workspaceNow === "") {
        await TabsmanPersistence.removeAndSaveTab(tabId, "pinned");
    }


    // 如果即将删除的是活跃标签页，且当前仅剩一个标签页，则直接关闭面板，否则切换到其他标签页
    const wasActiveTab = activeTabs[tabPanelId] === tab;
    if (wasActiveTab && tabIdSet.size === 1) {
        // 如果删除的是活跃标签页，且当前仅剩一个标签页，则直接关闭面板        
        orca.nav.close(tabPanelId);

        // 清理标签页数据和排序缓存
        delete tabs[tabId];
        tabIdSetByPanelId.delete(tabPanelId);
        delete activeTabs[tabPanelId];
        sortedTabsByPanelId.delete(tabPanelId);

        // ui更新主要依赖全局历史的变更，而关闭面板不会触发变更，因此需要手动通知UI更新
        // - 虎鲸1.41版本关闭面板已经会触发历史变更了，会导致orca对应面板的历史记录被清除。对此我在订阅函数里限制了历史变短时 **不做处理**。
        //   - 因为历史变短说明面板被关闭，而两个关闭命令已经被拦截下来了并执行了tab数据清理和ui刷新，所以完全没什么可处理的。
        // - 可以试着包装一下nav，这样可以放置一些插件拦截close
        if (renderTabsCallback) renderTabsCallback();
        
        return true;
    } else if(wasActiveTab){
        // 清理标签页数据和更新排序缓存
        delete tabs[tabId];
        tabIdSet.delete(tabId);
        updateSortedTabsCache(tabPanelId);
        
        const remainingTabIds = Array.from(tabIdSet);
        await switchTab(remainingTabIds[0]);
    } else {
        // 清理标签页数据和更新排序缓存
        delete tabs[tabId];
        tabIdSet.delete(tabId);
        updateSortedTabsCache(tabPanelId);
        
        if (renderTabsCallback) renderTabsCallback();
    }

    // 考虑一下直接用这个id作为tabid
    // tabCounter--;

    console.log(`[tabsman] 已删除标签页: ${tabId}`);
    return true;
}


window.pluginTabsman.moveTabToPanel = async function(tabId, newPanelId) {
    const tab = tabs[tabId];
    if (tab.panelId === newPanelId) {
        return false;
    }
    const oldPanelId = tab.panelId;
    if (tabIdSetByPanelId.get(oldPanelId).size === 1) {
        orca.notify("warn", "[tabsman] 当前面板只有一个标签页，无法移动");
        return false;
    }

    // 如果被移走的是active面板的active-tab，则先执行navPreviousTab
    if (tab.panelId === orca.state.activePanel && tab.isActive) {
        await switchToPreviousTab();

    } else if (activeTabs[oldPanelId] === tab) {
        // 否则，如果只是非active面板的active-tab，则切换到上一个标签页作为active-tab
        const tabIndex = getOneSortedTabs(oldPanelId).findIndex(tab => tab.id === tabId);
        const prevTabIndex = tabIndex === 0 ? tabIndex + 1 : tabIndex - 1;
        const prevTab = getOneSortedTabs(oldPanelId)[prevTabIndex];
        tab.isActive = false;
        prevTab.isActive = true;
        activeTabs[oldPanelId] = prevTab;

        // 导航到新的前台标签页
        isInternalNavigation = true;
        const isJournal = prevTab.currentBlockId instanceof Date;
        orca.nav.goTo(
            isJournal ? 'journal' : 'block',
            isJournal ? { date: prevTab.currentBlockId } : { blockId: prevTab.currentBlockId },
            prevTab.panelId
        );

        // 如果新的前台标签页没有历史记录，则填充初始历史。
        if (prevTab.backStack.length === 0) {
            const prevPanel = orca.nav.findViewPanel(prevTab.panelId, orca.state.panels);
            prevTab.backStack.push({
                activePanel: prevPanel.id,
                view: prevPanel.view,
                viewArgs: prevPanel.viewArgs
            });            
        }

        // 重置内部导航标志（不用重置，handle函数会自动重置
        // isInternalNavigation = false;
    }

    // 更新数据库，并通知ui刷新
    tabIdSetByPanelId.get(oldPanelId).delete(tabId);
    tab.panelId = newPanelId;
    tabIdSetByPanelId.get(newPanelId).add(tabId);
    updateSortedTabsCache(oldPanelId);
    updateSortedTabsCache(newPanelId);
    if (renderTabsCallback) renderTabsCallback();
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
    tab.pinOrder = Date.now();
    
    // 更新排序缓存
    updateSortedTabsCache(tab.panelId);

    // 通知UI更新（置顶标签页会改变排序，需要重新渲染标签页列表）
    if (renderTabsCallback) renderTabsCallback();
    
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
    tab.pinOrder = 0;
    
    // 更新排序缓存
    updateSortedTabsCache(tab.panelId);

    // 通知UI更新（取消置顶标签页会改变排序，需要重新渲染标签页列表）
    if (renderTabsCallback) renderTabsCallback();
    
    // 移除对应数据
    // 2025-11-23 不在工作区时，持久化处理。在工作区不需要，因为工作区自带持久化
    if (workspaceNow === "") await TabsmanPersistence.removeAndSaveTab(tabId, "pinned")
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
        scrollInfo[panelId] = panelViewState[rootBlockId].scrollTop
    }
    return scrollInfo
}

// 保存工作空间
async function saveWorkspace(name, needEmpty = false){
    const sname = String(name)
    // 时间戳前缀用于排序（getDataKeys获取的数组是按照keys的码值排序的）
    // 【变更】不再刻意重名，只禁止恶意重名：一个时间戳内连续生成相同name
    const saveName = String(Date.now()) + "_" + sname

    const existName = await orca.plugins.getData('tabsman-workspace', saveName)
    if (existName || existName === "tabsman-workspace-exit"){
        orca.notify("info", "[tabsman]name已存在。另外，name不可使用tabsman-workspace-exit");
        return ""
    }

    if (needEmpty) {
        const currentBlockId = new Date(new Date().toDateString());
        const tabInfo = await generateTabNameAndIcon(currentBlockId);
        const tab = createTabObject(currentBlockId, "", tabInfo.icon, tabInfo.name);
        tab.isActive = true
        tab.backStack.push({
            activePanel: "",
            view: "journal",
            viewArgs: { date: new Date(new Date().toDateString())}
        });
        const tabsEmpty = {}
        tabsEmpty[tab.id] = tab;
        await orca.plugins.setData('tabsman-workspace', saveName, JSON.stringify(tabsEmpty));

    } else {
        await orca.plugins.setData('tabsman-workspace', saveName, JSON.stringify(tabs));
        await orca.plugins.setData('tabsman-workspace-scroll', saveName, JSON.stringify(getPanelScrollInfo()));
    }

    orca.notify("success", "[tabsman]新工作区创建成功！");
    return saveName

    // 【变更】不再禁止重名
    // TODO const hasPrefix = sname.indexOf("_") === 13 
    // const existName = await orca.plugins.getData('tabsman-workspace', sname)
    // if (existName || existName === "tabsman-workspace-exit"){
    //     orca.notify("info", "[tabsman]name已存在。另外，name不可使用tabsman-workspace-exit");
    //     return 0
    // }
    // await orca.plugins.setData('tabsman-workspace', sname, JSON.stringify(tabs));
    // orca.notify("success", "[tabsman]新工作区创建成功！");
    // return 1
}

// 显示所有的工作空间name
async function getAllWorkspace(){
    const keys = await orca.plugins.getDataKeys("tabsman-workspace")
    // console.log("Stored tabsman-workspace names:", keys)

    // 【变更】不再去除前缀
    // const cleanKeys = keys.map(k => k.slice(k.indexOf('_') + 1));

    return keys
}

// 删除指定name的工作空间，返回值1用于删除时是否正处于该工作区
// let lastWorkspaceName = ""
async function deleteWorkspace(name) {
    const sname = String(name)
    await orca.plugins.removeData("tabsman-workspace", sname)
    await orca.plugins.removeData("tabsman-workspace-scroll", sname)
    // if (lastWorkspaceName === sname) await orca.plugins.removeData("tabsman-workspace-feature", "last-workspace-name")
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
    // orca.plugins.clearData("tabsman-workspace-feature")
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
    // console.log("1开始打开sname:", sname,"当前为：",workspaceNow)
    // 如果当前打开的就是目标工作区，则跳过。
    if (workspaceNow === sname) {
        orca.notify("info", "[tabsman]当前已在该工作空间")
        return
    }
    
    // 读取工作空间数据，包括滚动信息
    const workspaceRaw = await orca.plugins.getData('tabsman-workspace', sname ? sname : "tabsman-workspace-exit");
    if (!workspaceRaw) {
        orca.notify("info", "[tabsman]目标工作空间数据不存在")
        return
    }

    // console.log("2开始打开sname:", sname,"当前为：",workspaceNow)
    // 维护退出点数据
    if (workspaceNow === "") {
        await orca.plugins.setData('tabsman-workspace', "tabsman-workspace-exit", JSON.stringify(tabs));
        await orca.plugins.setData('tabsman-workspace-scroll', "tabsman-workspace-exit", JSON.stringify(getPanelScrollInfo()));
        // await orca.plugins.setData('tabsman-workspace-feature', "last-workspace-name", JSON.stringify(sname));
    } else if (sname === "") {
        // 丢弃过时的退出点
        await orca.plugins.removeData("tabsman-workspace", "tabsman-workspace-exit")
        await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
    } else if (sname) {
        await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
        // await orca.plugins.setData('tabsman-workspace-feature', "last-workspace-name", JSON.stringify(sname));
    }
    workspaceNow = sname

    // 恢复工作区tabs数据
    let workspaceTabs = {};
    let workspaceActiveTabs = {};
    let workspaceTabIdSetByPanelId = new Map();
    const workspaceValue = TabsmanPersistence.wakeTabArray(Object.values(JSON.parse(workspaceRaw)), "workspace");
    for (const tab of workspaceValue) {
        const tabId = tab.id
        const tabPanelId = tab.panelId

        // 准备tabs
        workspaceTabs[tabId] = tab

        // 准备activeTabs
        if (tab.isActive) {
            workspaceActiveTabs[tabPanelId] = tab
        }

        // 准备TabIdSetByPanelId
        if (!workspaceTabIdSetByPanelId.has(tabPanelId)) {
            workspaceTabIdSetByPanelId.set(tabPanelId, new Set())
        }
        workspaceTabIdSetByPanelId.get(tabPanelId).add(tabId)
    }
    tabs = workspaceTabs
    activeTabs = workspaceActiveTabs
    tabIdSetByPanelId = workspaceTabIdSetByPanelId


    // 新建新的面板
    // 临时面板, 用作创建新面板的坐标
    workspaceSwitching = true
    const tmp = originalAddTo(orca.state.activePanel, "right")
    orca.nav.closeAllBut(tmp)

    // 遍历activetab以准备新面板
    const workspaceActiveTabsValue = Object.values(workspaceActiveTabs);
    const workspaceTabsValue = Object.values(workspaceTabs);
    const newPanelIds = []
    // 清除旧的排序缓存
    sortedTabsByPanelId.clear()
    for (const tab of workspaceActiveTabsValue) {
        const blockId = tab.currentBlockId
        const isDate = blockId instanceof Date;
        const viewpanel = {
            view: isDate? "journal" : "block",
            viewArgs: isDate? {date: blockId}:{blockId},
            viewState: {}
        }

        // 调用原始的addTo，以确保不改变tabsman数据结构
        const newPanelId = originalAddTo(orca.state.activePanel, "left", viewpanel)
        newPanelIds.push(newPanelId)
        const oldPanelId = tab.panelId

        // 更新数据结构的面板id
        workspaceActiveTabs[newPanelId] = tab
        delete workspaceActiveTabs[oldPanelId]
        workspaceTabIdSetByPanelId.set(newPanelId,workspaceTabIdSetByPanelId.get(oldPanelId))
        workspaceTabIdSetByPanelId.delete(oldPanelId)

        // 修改该面板所有tab对象的面板id
        workspaceTabsValue.forEach(tab => {
            if (tab.panelId === oldPanelId) tab.panelId = newPanelId
        })

        // 更新排序
        updateSortedTabsCache(newPanelId)

        // 滚动到上次打开的位置
        const workspaceScrollRaw = await orca.plugins.getData('tabsman-workspace-scroll', sname ? sname : "tabsman-workspace-exit")
        if (workspaceScrollRaw) {
            const workspaceScroll = JSON.parse(workspaceScrollRaw)
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

    orca.nav.close(tmp)

    if (renderTabsCallback) renderTabsCallback();

    workspaceSwitching = false
}
window.pluginTabsman.getAllWS = getAllWorkspace
window.pluginTabsman.deleteWS = deleteWorkspace
window.pluginTabsman.deleteAllWS = deleteAllWorkspace
window.pluginTabsman.saveWS = saveWorkspace
window.pluginTabsman.openWS = openWorkspace
window.pluginTabsman.exitWS = exitWorkspace

/* —————————————————————————————————————————————————————————————————————————————————————————————————— */
/* —————————————————————————————————————————————————————————————————————————————————————————————————— */
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
    
    console.log(`[tabsman] 切换到下一个标签页: ${nextTab.name} (${nextTab.id})`);
    return await switchTab(nextTab.id);
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
    
    console.log(`[tabsman] 切换到上一个标签页: ${prevTab.name} (${prevTab.id})`);
    return await switchTab(prevTab.id);
}




// ==================== 命令拦截 ====================

// 保存拦截器函数引用，以便后续注销
let beforeCommandHooks = {};

/**
 * 拦截Orca的核心导航命令和面板创建API和关闭API
 */
function setupCommandInterception() {
    // console.log('[tabsman] 开始设置命令拦截器...');
    
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
    orca.commands.registerBeforeCommand('core.goBack', beforeCommandHooks.goBack);
    
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
    orca.commands.registerBeforeCommand('core.goForward', beforeCommandHooks.goForward);
    
    // 3. 包装 orca.nav.goTo 以支持 Ctrl+点击创建后台标签页
    originalGoTo = orca.nav.goTo.bind(orca.nav);
    orca.nav.goTo = async function(view, viewArgs, panelId) {        
        // 处理 Ctrl+Click，且没有按下shift：创建后台标签页
        if (window.event && window.event.ctrlKey && !window.event.shiftKey && window.event.button === 0) {
            // 根据视图类型确定目标内容ID
            const targetBlockId = view === 'journal' ? viewArgs.date : viewArgs.blockId;
            try {
                // console.log(`panelId !== '_globalSearch' ================> ${panelId !== '_globalSearch'}`)
                if (panelId === '_globalSearch' || panelId === undefined) {
                    const activePanelId = document.querySelector('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active').dataset.tabsmanPanelId;
                    await createTab(targetBlockId, false, activePanelId);
                } else {
                    await createTab(targetBlockId, false);
                }
                orca.notify("success", "[tabsman] 已创建后台标签页");
            } catch (error) {
                console.error('[tabsman] 创建后台标签页失败:', error);
                orca.notify("error", "创建后台标签页失败");
            }
            return;
        }
        
        // 所有其他情况都执行原函数
        return originalGoTo(view, viewArgs, panelId);
    };
    
    // 4. 拦截 core.closePanel 命令（关闭当前面板）
    beforeCommandHooks.closePanel = () => {       
        if (tabIdSetByPanelId.size === 1) {
            // orca.notify("info", "[tabsman] 当前仅剩一个面板，无法关闭关闭面板");
            return false;
        }
        
        const activePanelId = orca.state.activePanel;
        // 清理当前面板的标签页数据
        const tabIdSet = tabIdSetByPanelId.get(activePanelId);
        tabIdSet.forEach(tabId => {
            delete tabs[tabId];
        });
        tabIdSetByPanelId.delete(activePanelId);
        delete activeTabs[activePanelId];
        sortedTabsByPanelId.delete(activePanelId);

        // 通知UI更新
        if (renderTabsCallback) renderTabsCallback();

        return true;
    };
    orca.commands.registerBeforeCommand('core.closePanel', beforeCommandHooks.closePanel);
    
    // 5. 拦截 core.closeOtherPanels 命令（关闭除当前面板外的所有面板）
    beforeCommandHooks.closeOtherPanels = () => {
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
        
        // 通知UI更新
        if (renderTabsCallback) renderTabsCallback();
        
        return true; // 允许命令继续执行
    };
    orca.commands.registerBeforeCommand('core.closeOtherPanels', beforeCommandHooks.closeOtherPanels);

}

// ==================== 初始化和清理 ====================
/**
 * 启动标签页系统
 * 初始化历史订阅、命令拦截和当前面板的标签页
 */
async function start(callback = null) {
    // console.log('\n=== [tabsman] tabsman管理器启动 ===');
    
    // 设置UI渲染回调函数
    // 2025年11月23日 适配工作区的更新
    renderTabsCallback = async function (){
        callback();
        // 进入具体工作空间后每次刷新ui都更新数据
        if (workspaceNow !== ""){
            await orca.plugins.setData('tabsman-workspace', workspaceNow, JSON.stringify(tabs));
            // await orca.plugins.setData('tabsman-workspace-scroll', workspaceNow, JSON.stringify(getPanelScrollInfo()));
        }
    }
    
    // 包装 addTo API
    originalAddTo = orca.nav.addTo.bind(orca.nav);
    orca.nav.addTo = function(id, dir, src) {
        const newPanelId = originalAddTo(id, dir, src);
        if (newPanelId) createTabForNewPanel(newPanelId);
        return newPanelId;
    };
    
    // 包装 openInLastPanel API（同步函数，返回void）
    originalOpenInLastPanel = orca.nav.openInLastPanel.bind(orca.nav);
    orca.nav.openInLastPanel = function(view, viewArgs) {
        // 处理 Ctrl+Shift+Click：创建前台标签页
        if (window.event && window.event.ctrlKey && window.event.shiftKey && window.event.button === 0) {
            try {
                const targetBlockId = view === 'journal' ? viewArgs.date : viewArgs.blockId;
                // console.log(`orca.state.activePanel ==============> ${orca.state.activePanel}`)
                if (orca.state.activePanel !== '_globalSearch') {
                    const activePanelId = document.querySelector('.plugin-tabsman-panel-group.plugin-tabsman-panel-group-active').dataset.tabsmanPanelId;
                    createTab(targetBlockId, true, activePanelId);
                } else {
                    createTab(targetBlockId, true);
                }
                orca.notify("success", "[tabsman] 已创建前台标签页");
            } catch (error) {
                console.error('[tabsman] 创建前台标签页失败:', error);
                orca.notify("error", "创建前台标签页失败");
            }
            return;
        }
        
        // 调用原始函数
        originalOpenInLastPanel(view, viewArgs);
        console.log('[tabsman] ✅ 面板创建API执行完成: openInLastPanel');
        
        // 如果还没有这个面板的标签页，则初始化一份默认的标签页
        if (!tabIdSetByPanelId.has(orca.state.activePanel)) createTabForNewPanel();
    };

    
    // 为启动时的所有面板创建初始标签页
    try {
        const panelIds = Object.keys(getCurrentBlockIds());
        
        for (const panelId of panelIds) {
            // 为新面板创建初始标签页
            await createTabForNewPanel(panelId);
        }
        
        console.log(`[tabsman] 本次启动共发现了 ${panelIds.length} 个面板:`, panelIds, '，现已创建初始标签页。');
    } catch (error) {
        console.error('[tabsman] 创建初始标签页失败:', error);
    }
    
    // 设置订阅
    unsubscribe = setupSubscription();
    
    // 设置命令拦截
    setupCommandInterception();
    

    // 恢复所有持久化数据（置顶标签页、收藏块、最近关闭标签页）
    try {
        // 1. 恢复置顶标签页
        const pinnedTabsData = await orca.plugins.getData('tabsman', 'pinned-tabs-data');
        if (pinnedTabsData) {
            const pinnedTabs = await TabsmanPersistence.restoreTabs(JSON.parse(pinnedTabsData), "pinned");
            console.log(`[tabsman] 恢复置顶标签页完成，共恢复 ${pinnedTabs.length} 个标签页`);
            // 更新当前面板的排序缓存
            updateSortedTabsCache(orca.state.activePanel);
        }

        // 2. 恢复收藏块数据
        const favoriteBlocksData = await orca.plugins.getData('tabsman', 'favorite-blocks-data');
        if (favoriteBlocksData) {
            TabsmanPersistence.restoreFavoriteBlocks(JSON.parse(favoriteBlocksData));
            console.log(`[tabsman] 恢复收藏块数据完成，共恢复 ${TabsmanPersistence.getFavoriteBlockArray().length} 个收藏块`);
        }

        // 3. 恢复最近关闭标签页
        const recentlyClosedData = await orca.plugins.getData('tabsman', 'recently-closed-tabs-data');
        if (recentlyClosedData) {
            const closedTabs = await TabsmanPersistence.restoreTabs(JSON.parse(recentlyClosedData), "recently-closed");
            console.log(`[tabsman] 恢复最近关闭标签页完成，共恢复 ${closedTabs.length} 个标签页`);
        }
    } catch (error) {
        console.error('[tabsman] 恢复持久化数据失败:', error);
    }

    // 暴露 get 函数到全局（调试）
    window.pluginTabsman.getAllTabs = getAllTabs;
    window.pluginTabsman.getActiveTabs = getActiveTabs;
    window.pluginTabsman.getTabIdSetByPanelId = getTabIdSetByPanelId;
    window.pluginTabsman.getOneSortedTabs = getOneSortedTabs;
    window.pluginTabsman.getAllSortedTabs = getAllSortedTabs;

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
    // 取消所有订阅
    if (unsubscribe) {
        unsubscribe.forEach(unsub => {
            if (unsub) unsub();
        });
        unsubscribe = null;
    }

    // 清理全局状态
    tabs = {};
    tabCounter = 0;  // 重置计数器
    activeTabs = {};
    tabIdSetByPanelId.clear();
    sortedTabsByPanelId.clear();  // 清理排序缓存
    isInternalNavigation = false;
    
    // 恢复原始API函数
    if (originalGoTo) {
        orca.nav.goTo = originalGoTo;
        originalGoTo = null;
    }
    
    // 清理原始API函数
    originalAddTo = null;
    originalOpenInLastPanel = null;

    // 清理注册的命令
    orca.commands.unregisterCommand('tabsman.goToNextTab');
    orca.commands.unregisterCommand('tabsman.goToPreviousTab');
    
    // 注销命令拦截器
    if (beforeCommandHooks.goBack) {
        orca.commands.unregisterBeforeCommand('core.goBack', beforeCommandHooks.goBack);
    }
    if (beforeCommandHooks.goForward) {
        orca.commands.unregisterBeforeCommand('core.goForward', beforeCommandHooks.goForward);
    }
    if (beforeCommandHooks.closePanel) {
        orca.commands.unregisterBeforeCommand('core.closePanel', beforeCommandHooks.closePanel);
    }
    if (beforeCommandHooks.closeOtherPanels) {
        orca.commands.unregisterBeforeCommand('core.closeOtherPanels', beforeCommandHooks.closeOtherPanels);
    }
    
    // 清理拦截器函数引用
    beforeCommandHooks = {};
    
    // 清理全局暴露的函数
    delete window.pluginTabsman.getAllTabs;
    delete window.pluginTabsman.getActiveTabs;
    delete window.pluginTabsman.getTabIdSetByPanelId;
    delete window.pluginTabsman.getOneSortedTabs;
    delete window.pluginTabsman.getAllSortedTabs;
    
    // 清理UI渲染回调函数
    renderTabsCallback = null;
}


// ==================== 数据访问函数 ====================

function getTabIdSetByPanelId() {
    return tabIdSetByPanelId;
}

function getAllTabs() {
    return tabs;
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
 * 获取指定面板的一个排序标签页列表（从缓存中获取，性能更好）
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
    getAllTabs,
    getActiveTabs,
    getOneSortedTabs,
    getAllSortedTabs,
    // 核心操作函数
    createTab,
    createTabObject,
    deleteTab,
    switchTab,
    // Pin功能函数
    pinTab,
    unpinTab,
    // 排序缓存函数
    updateSortedTabsCache,
    // 标签页信息生成函数
    generateTabNameAndIcon,
    // 标签页导航函数
    switchToNextTab,
    switchToPreviousTab
};