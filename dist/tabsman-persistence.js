/**
 * Tabsman 置顶标签页持久化模块
 * 负责置顶标签页数据的保存和恢复
 */

// 导入 core 模块
import * as TabsmanCore from './tabsman-core.js';

/**
 * 配置常量
 */
const CONFIG = {
    MAX_RECENTLY_CLOSED_TABS: 5  // 最近关闭标签页最大保存数量
};

/** @type {Array} pinTab数组，存储需要被[持久化存储]的所有置顶标签页 */
let pinnedTabArray = [];
/** @type {Array} recentlyClosedTab数组，存储需要被[持久化存储]的所有最近关闭标签页 */
let recentlyClosedTabArray = [];
/** @type {Array} 标签页数组，存储需要被[持久化存储]的所有收藏标签页 */
let favoriteTabArray = [];


/**
 * 保存特定类型的标签页数组到库文件
 * @param {'pinned'|'recently-closed '|'favorite'} tabType - 标签页类型
 * @returns {Promise<void>} 返回Promise
 */
async function saveTabArray(tabType = "") {
    switch (tabType) {
        case "pinned":
            await orca.plugins.setData('tabsman', 'pinned-tabs-data', JSON.stringify(pinnedTabArray));
            console.log(`已保存 ${pinnedTabArray.length} 个置顶标签页`);
            break;
        case "recently-closed":
            await orca.plugins.setData('tabsman', 'recently-closed-tabs-data', JSON.stringify(recentlyClosedTabArray));
            console.log(`已保存 ${recentlyClosedTabArray.length} 个最近关闭标签页`);
            break;
        case "favorite":
            await orca.plugins.setData('tabsman', 'favorite-tab-data', JSON.stringify(favoriteTabArray));
            console.log(`已保存 ${favoriteTabArray.length} 个收藏标签页`);
            break;
    }
}


/**
 * 添加对应类型的标签页对象到全局数组并保存到存储文件。该函数暴露给其他模块使用。
 * @param {Object} tab - 标签页对象
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function addAndSaveTab(tab, tabType = "") {
    
    // 将tab保存至对应数组等待写入持久化。
    switch (tabType) {
        case "pinned": {
            pinnedTabArray.push(tab);
            break;
        }
        case "recently-closed": {
            if (recentlyClosedTabArray.length >= CONFIG.MAX_RECENTLY_CLOSED_TABS) {
                recentlyClosedTabArray.pop();
            }
            recentlyClosedTabArray.unshift(tab);
            break;
        }
        case "favorite": {
            const existSameFavorite = favoriteTabArray.find(favoriteTab => favoriteTab.currentBlockId === tab.currentBlockId);
            if (existSameFavorite) {
                orca.notify("warn", "已存在内容相同的标签页，无需重复收藏");
                return;
            }
            favoriteTabArray.unshift(tab);
            break;
        }
    }

    // 将本次变更写入orca库文件
    await saveTabArray(tabType);
}

/**
 * 从全局数组中移除标签页数据，暴露给其他模块使用
 * @param {string} tabId - 标签页ID
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function removeAndSaveTab(tab, tabType = "") {
    let tabArray;
    switch (tabType) {
        case "pinned": tabArray = pinnedTabArray;break;
        case "recently-closed": tabArray = recentlyClosedTabArray;break;
        case "favorite": tabArray = favoriteTabArray;break;
    }

    let index;
    if ( tabType === "favorite" ) {
        index = tabArray.findIndex(item => item.currentBlockId === tab.currentBlockId);
    } else {
        index = tabArray.findIndex(item => item.id === tab.id);
    }
    if (index !== -1) tabArray.splice(index, 1);
        
    // 将变更写入orca库文件
    await saveTabArray(tabType);
}

/**
 * 唤醒标签页对象数组
 * @param {Array} rawTabArray - 从json字符串parse()到的原始标签页对象数组，需要将其字符串日期字段转换回Date对象
 * @param {'pinned'|'recently-closed'|'favorite'} tabType - 标签页类型
 * @returns {Array} 唤醒后的标签页对象数组
 */
function wakeTabArray(rawTabArray, tabType = "") {

    const currentPanelId = orca.state.activePanel;
    if (tabType === "workspace") {
        // 工作区的id需要保持不变，以便正确恢复到对应面板；非工作区的id则不需要，恢复时直接放在当前活跃面板即可
        rawTab.panelId = currentPanelId;
    }

    for (const rawTab of rawTabArray) {
        // 转换 backStack，只处理日志视图，block视图不用处理
        for (const item of rawTab.backStack) {
            if (item.view === "journal") item.viewArgs.date = new Date(item.viewArgs.date)
        }

        // 转换 forwardStack，只处理日志视图，block视图不用处理
        for (const item of rawTab.forwardStack) {
            if (item.view === "journal") item.viewArgs.date = new Date(item.viewArgs.date)
        }

        // 日期字符串恢复为Date对象
        if (typeof rawTab.createdAt === 'string') {
            rawTab.createdAt = new Date(rawTab.createdAt);
        }
        if (typeof rawTab.currentBlockId === 'string') {
            const testDateString = new Date(rawTab.currentBlockId);
            // 无效的日期字符串
            const isNotDate = !isNaN(testDateString.getTime())
            rawTab.currentBlockId = isNotDate ? testDateString : rawTab.currentBlockId
        }
    }
    return rawTabArray;
}

/**
 * 初始化时恢复标签页到模块内存对象
 * @param {Array} rawTabArray - 从json字符串解析出来的原始标签页数据数组（日期字段为字符串格式）
 * @param {'pinned'|'recently-closed'|'favorite'} tabType - 标签页类型
 * @returns {Promise<Array>} 返回恢复的标签页数组
 */
async function restoreTabs(rawTabArray, tabType) {
    if (!Array.isArray(rawTabArray) || rawTabArray.length === 0) return [];

    // 唤醒标签页数据
    const tabArray = wakeTabArray(rawTabArray, tabType);

    switch (tabType) {
        case "pinned":
            // 持久化数据载入到模块内存对象，并导入到core数据结构
            pinnedTabArray = tabArray;
            TabsmanCore.importTabToActivePanel(pinnedTabArray);
            return pinnedTabArray;
        case "recently-closed":
            recentlyClosedTabArray = tabArray;
            return recentlyClosedTabArray;
        case "favorite":
            favoriteTabArray = tabArray;
            return favoriteTabArray;
    }
}


// 恢复所有持久化数据（置顶标签页、收藏块、最近关闭标签页）
async function restorePersistedData() {
    try {
        // 1. 恢复置顶标签页
        const pinnedTabsData = await orca.plugins.getData('tabsman', 'pinned-tabs-data');
        if (pinnedTabsData) {
            const pinnedTabs = await restoreTabs(JSON.parse(pinnedTabsData), "pinned");
            console.log(`[tabsman] 恢复置顶标签页完成，共恢复 ${pinnedTabs.length} 个标签页`);
        }

        // 2. 恢复收藏标签页数据
        const favoriteTabsData = await orca.plugins.getData('tabsman', 'favorite-tab-data');
        if (favoriteTabsData) {
            const favoriteTabs = await restoreTabs(JSON.parse(favoriteTabsData), "favorite");
            console.log(`[tabsman] 恢复收藏标签页数据完成，共恢复 ${favoriteTabs.length} 个标签页`);
        }

        // 3. 恢复最近关闭标签页
        const recentlyClosedData = await orca.plugins.getData('tabsman', 'recently-closed-tabs-data');
        if (recentlyClosedData) {
            const closedTabs = await restoreTabs(JSON.parse(recentlyClosedData), "recently-closed");
            console.log(`[tabsman] 恢复最近关闭标签页完成，共恢复 ${closedTabs.length} 个标签页`);
        }
    } catch (error) {
        console.error('[tabsman] 恢复持久化数据失败:', error);
    }
}



/**
 * 获取指定类型的标签页数组
 * @param {'pinned'|'recently-closed'|'favorite'} tabType - 标签页类型
 * @returns {Array} 对应类型的标签页数组
 */
function getTabArray(tabType) {
    switch (tabType) {
        case "pinned": return pinnedTabArray;
        case "recently-closed": return recentlyClosedTabArray;
        case "favorite": return favoriteTabArray;
    }
}

export {
    addAndSaveTab,
    removeAndSaveTab,
    restoreTabs,
    getTabArray,
    wakeTabArray,
    restorePersistedData
};