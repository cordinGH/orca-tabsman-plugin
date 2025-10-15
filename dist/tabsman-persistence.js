/**
 * Tabsman 置顶标签页持久化模块
 * 负责置顶标签页数据的保存和恢复
 */

// 最近关闭标签页数据更新回调函数
let recentlyClosedTabsCallback = null;

/**
 * 配置常量
 */
const CONFIG = {
    MAX_RECENTLY_CLOSED_TABS: 5  // 最近关闭标签页最大保存数量
};

/**
 * 设置最近关闭标签页数据更新回调函数
 * @param {Function} callback - 回调函数，接收新的最近关闭标签页数据
 */
function setRecentlyClosedTabsCallback(callback) {
    recentlyClosedTabsCallback = callback;
}

/** @type {Array} 全局pinTab元数据数组，存储需要被[持久化存储]的所有置顶标签页的元数据 */
const pinnedTabData = [];
/** @type {Array} 全局recentlyClosedTab元数据数组，存储需要被[持久化存储]的所有最近关闭标签页的元数据 */
const recentlyClosedTabData = [];

/**
 * 从残缺的标签页对象重建完整标签页对象
 * @param {Object} tabData - 残缺的标签页对象
 * @param {string} panelId - 面板ID
 * @returns {Object} 重建的完整标签页对象
 */
function rebuildTabFromData(tabData, panelId) {
    return {
        id: tabData.id,
        panelId: panelId,
        name: tabData.name,
        createdAt: tabData.createdAt,
        lastAccessed: new Date(),
        isActive: false,
        currentBlockId: tabData.currentBlockId,
        currentIcon: tabData.currentIcon,
        isPinned: tabData.isPinned,
        pinOrder: tabData.pinOrder,
        backStack: tabData.backStack,
        forwardStack: tabData.forwardStack
    };
}

/**
 * 添加固定标签页数据到全局数组
 * @param {Object} tab - 标签页对象
 */
function addPinnedTabData(tab) {
    pinnedTabData.push({
        id: tab.id,
        name: tab.name,
        createdAt: tab.createdAt,
        currentBlockId: tab.currentBlockId,
        currentIcon: tab.currentIcon,
        backStack: [],
        forwardStack: []
    });
}

/**
 * 添加最近关闭标签页数据到全局数组
 * @param {Object} tab - 标签页对象
 */
function addRecentlyClosedTabData(tab) {
    if (recentlyClosedTabData.length >= CONFIG.MAX_RECENTLY_CLOSED_TABS) recentlyClosedTabData.pop();
    recentlyClosedTabData.unshift({
        id: tab.id,
        name: tab.name,
        createdAt: tab.createdAt,
        currentBlockId: tab.currentBlockId,
        currentIcon: tab.currentIcon,
        backStack: tab.backStack,
        forwardStack: tab.forwardStack
    });
}


/**
 * 保存特定类型的标签页数据到库文件
 * @param {'pinned'|'deleted'} tabDataType - 标签页类型，只能是'pinned'或'deleted'
 * @returns {Promise<void>} 返回Promise
 */
async function saveTabsData(tabDataType = "") {
    switch (tabDataType) {
        case "pinned":
            await orca.plugins.setData('tabsman', 'pinned-tabs-data', JSON.stringify(pinnedTabData));
            console.log(`已保存 ${pinnedTabData.length} 个置顶标签页`);
            break;
        case "recently-closed":
            await orca.plugins.setData('tabsman', 'recently-closed-tabs-data', JSON.stringify(recentlyClosedTabData));
            console.log(`已保存 ${recentlyClosedTabData.length} 个最近关闭标签页`);
            break;
    }
}


/**
 * 添加标签页数据到全局数组，暴露给其他模块使用
 * @param {Object} tab - 标签页对象
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function addAndSaveTabData(tab, tabType = "") {
    switch (tabType) {
        case "pinned":
            // 使用专门的固定标签页添加函数
            addPinnedTabData(tab);
            break;
        case "recently-closed":
            // 使用专门的最近关闭标签页添加函数
            addRecentlyClosedTabData(tab);
            break;
    }
    
    // 将变更写入orca库文件
    await saveTabsData(tabType);
    
    // 如果是最近关闭标签页，通过回调通知UI更新
    if (tabType === "recently-closed" && recentlyClosedTabsCallback) {
        // 使用transformTabsData处理数据，然后使用rebuildTabFromData重建后，通过回调通知UI更新
        const processedData = transformTabsData(recentlyClosedTabData, "recently-closed");
        const rebuiltTabs = [];
        for (let i = 0; i < processedData.length; i++) {
            const tabData = processedData[i];
            const rebuiltTab = rebuildTabFromData(tabData, orca.state.activePanel);
            rebuiltTabs.push(rebuiltTab);
        }
        recentlyClosedTabsCallback(rebuiltTabs);
    }
}



/**
 * 从指定数组中移除标签页数据
 * @param {string} tabId - 标签页ID
 * @param {Array} tabDataArray - 目标数组，用于移除标签页数据
 */
function removeTabData(tabId, tabDataArray = []) {
    // 直接查找并移除
    const index = tabDataArray.findIndex(item => item.id === tabId);
    if (index !== -1) {
        tabDataArray.splice(index, 1);
    }
}


/**
 * 从全局数组中移除标签页数据，暴露给其他模块使用
 * @param {string} tabId - 标签页ID
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function removeAndSaveTabData(tabId, tabType = "") {
    switch (tabType) {
        case "pinned":
            // 从全局数组移除
            removeTabData(tabId, pinnedTabData);
            break;
        case "recently-closed":
            // 从全局数组移除
            removeTabData(tabId, recentlyClosedTabData);
            break;
    }
    
    // 将变更写入orca库文件
    await saveTabsData(tabType);
}


/**
 * 将解析后的日期字符串转换为Date对象
 * @param {Array} tabsData - 原始标签页数据数组
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Array} 转换后的标签页数据数组
 */
function transformTabsData(tabsData, tabType = "") {
    if (tabType === "recently-closed") {
        // 使用循环函数处理每个标签页数据
        for (let i = 0; i < tabsData.length; i++) {
            const tabData = tabsData[i];
            
            // 转换 backStack
            for (let j = 0; j < tabData.backStack.length; j++) {
                const item = tabData.backStack[j];
                // 只处理日期字符串，跳过其他参数
                if (item.viewArgs && typeof item.viewArgs.date === 'string') {
                    item.viewArgs.date = new Date(item.viewArgs.date);
                }
            }
        
            // 转换 forwardStack
            for (let j = 0; j < tabData.forwardStack.length; j++) {
                const item = tabData.forwardStack[j];
                // 只处理日期字符串，跳过其他参数
                if (item.viewArgs && typeof item.viewArgs.date === 'string') {
                    item.viewArgs.date = new Date(item.viewArgs.date);
                }
            }

            // 转换主要的日期字段
            if (typeof tabData.createdAt === 'string') {
                tabData.createdAt = new Date(tabData.createdAt);
            }
            if (typeof tabData.currentBlockId === 'string') {
                tabData.currentBlockId = new Date(tabData.currentBlockId);
            }

            tabData.isPinned = false;
            tabData.pinOrder = 0;
        }
        return tabsData;
    }
    
    if (tabType === "pinned") {
        // 使用循环函数处理每个标签页数据
        for (let i = 0; i < tabsData.length; i++) {
            const tabData = tabsData[i];
            // 转换主要的日期字段
            if (typeof tabData.createdAt === 'string') {
                tabData.createdAt = new Date(tabData.createdAt);
            }
            if (typeof tabData.currentBlockId === 'string') {
                tabData.currentBlockId = new Date(tabData.currentBlockId);
            }

            tabData.isPinned = true;
            tabData.pinOrder = i + 1;
        }
        return tabsData;
    }
}


/**
 * 恢复标签页
 * @param {Array} tabsData - 解析出来的TabsData数组
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @param {Object} [tabs] - core中标签页对象Map（仅pinned类型需要）
 * @param {Map} [tabIdSetByPanelId] - core中按面板分组的标签页ID集合Map（仅pinned类型需要）
 * @returns {Promise<number>} 返回恢复的标签页数量
 */
async function restoreTabs(tabsData, tabType, tabs = null, tabIdSetByPanelId = null) {
    if (!Array.isArray(tabsData) || tabsData.length === 0) return 0;
    
    // 根据类型转换数据
    const processedTabsData = transformTabsData(tabsData, tabType);
    
    const currentPanelId = orca.state.activePanel;
    
    // 根据类型执行不同的处理逻辑
    if (tabType === "pinned") {
        // 验证pinned类型需要的参数
        if (!tabs || !tabIdSetByPanelId) {
            throw new Error('pinned类型需要提供tabs和tabIdSetByPanelId参数');
        }
        
        // 处理置顶标签页：注册到core数据结构
        for (let i = 0; i < processedTabsData.length; i++) {
            const tabData = processedTabsData[i];
            const rebuiltTab = rebuildTabFromData(tabData, currentPanelId);
            
            // 注册到core数据结构
            tabs[rebuiltTab.id] = rebuiltTab;
            if (!tabIdSetByPanelId.has(rebuiltTab.panelId)) {
                tabIdSetByPanelId.set(rebuiltTab.panelId, new Set());
            }

            tabIdSetByPanelId.get(rebuiltTab.panelId).add(rebuiltTab.id);
            addPinnedTabData(rebuiltTab);
        }
        saveTabsData("pinned");
    } else if (tabType === "recently-closed") {
        // 处理已删除标签页：通过回调通知popup更新数据
        const rebuiltTabs = [];
        for (let i = 0; i < processedTabsData.length; i++) {
            const tabData = processedTabsData[i];
            const rebuiltTab = rebuildTabFromData(tabData, currentPanelId);
            rebuiltTabs.push(rebuiltTab);
            addRecentlyClosedTabData(rebuiltTab);
        }
        // 通过回调通知popup更新数据
        if (recentlyClosedTabsCallback) {
            recentlyClosedTabsCallback(rebuiltTabs);
        }
        // saveTabsData("recently-closed");
    }

    // 返回恢复的pinnedTabData数量，以更新core中的pinOrder起始值（如果需要的话）
    return processedTabsData.length;
}

export {
    addAndSaveTabData,
    removeAndSaveTabData,
    restoreTabs,
    setRecentlyClosedTabsCallback
};