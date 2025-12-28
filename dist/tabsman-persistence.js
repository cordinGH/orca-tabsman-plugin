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




/** @type {Array} 全局pinTab数组，存储需要被[持久化存储]的所有置顶标签页 */
let pinnedTabArray = [];
/** @type {Array} 全局recentlyClosedTab数组，存储需要被[持久化存储]的所有最近关闭标签页 */
let recentlyClosedTabArray = [];
/** @type {Array} 全局favoriteBlockArray，存储需要被[持久化存储]的所有收藏块对象 */
let favoriteBlockArray = [];


/**
 * 保存特定类型的标签页数组到库文件
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型
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
    }
}


/**
 * 添加对应类型的标签页对象到全局数组并保存到存储文件。该函数暴露给其他模块使用。
 * @param {Object} tab - 标签页对象
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function addAndSaveTab(tab, tabType = "") {
    const tabCopy = { ...tab };
    tabCopy.panelId = "";
    
    // 根据不同tab类型修订一下属性再存入运行时内存和持久化内存
    switch (tabType) {
        case "pinned": {
            tabCopy.backStack = [];
            tabCopy.forwardStack = [];
            pinnedTabArray.unshift(tabCopy);
            break;
        }
        case "recently-closed": {
            if (recentlyClosedTabArray.length >= CONFIG.MAX_RECENTLY_CLOSED_TABS) {
                recentlyClosedTabArray.pop();
            }
            recentlyClosedTabArray.unshift(tabCopy);
            break;
        }
    }

    // 将变更写入orca库文件
    await saveTabArray(tabType);
}

/**
 * 从全局数组中移除标签页数据，暴露给其他模块使用
 * @param {string} tabId - 标签页ID
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型，只能是'pinned'或'recently-closed'
 * @returns {Promise<void>} 返回Promise
 */
async function removeAndSaveTab(tabId, tabType = "") {
    /**
     * 从指定数组中移除标签页对象
     * @param {string} tabId - 标签页ID
     * @param {Array} tabArray - 目标数组，用于移除标签页对象
     */
    function removeTab(tabId, tabArray = []) {
        // 直接查找并移除
        const index = tabArray.findIndex(item => item.id === tabId);
        if (index !== -1) tabArray.splice(index, 1);
    }

    switch (tabType) {
        case "pinned":
            // 从全局数组移除
            removeTab(tabId, pinnedTabArray);
            break;
        case "recently-closed":
            // 从全局数组移除
            removeTab(tabId, recentlyClosedTabArray);
            break;
    }

    // 将变更写入orca库文件
    await saveTabArray(tabType);
}


/**
 * 添加收藏块到全局数组并保存到存储文件。该函数暴露给其他模块使用。
 * @param {Object} block - 收藏块对象
 * @returns {Promise<boolean>} 返回是否成功
 */
async function addAndSaveFavoriteBlock(blockObject = {id, icon, title}) {
    // 将id转换为字符串进行比较，避免日期对象比较失败
    if (favoriteBlockArray.findIndex(item => item.id.toString() === blockObject.id.toString()) !== -1) {
        orca.notify("warn", "该收藏块已存在");
        return false;
    }
    favoriteBlockArray.unshift(blockObject);
    await orca.plugins.setData('tabsman', 'favorite-blocks-data', JSON.stringify(favoriteBlockArray));
    console.log(`已保存 ${favoriteBlockArray.length} 个收藏块`);
    return true;
}

/**
 * 从全局数组中移除收藏块并保存到存储文件。该函数暴露给其他模块使用。
 * @param {string} id - 收藏块ID
 * @returns {Promise<void>} 返回Promise
 */
async function removeAndSaveFavoriteBlock(id) {
    const index = favoriteBlockArray.findIndex(item => item.id.toString() === id.toString());
    if (index !== -1) {
        favoriteBlockArray.splice(index, 1);
        await orca.plugins.setData('tabsman', 'favorite-blocks-data', JSON.stringify(favoriteBlockArray));
        console.log(`已保存 ${favoriteBlockArray.length} 个收藏块`);
    }
}



/**
 * 唤醒标签页对象数组
 * @param {Array} rawTabArray - 从json字符串解析出来的原始标签页对象数组（日期字段为字符串格式）
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型
 * @returns {Array} 唤醒后的标签页对象数组
 */
function wakeTabArray(rawTabArray, tabType = "") {
    /**
     * 唤醒标签页对象中的日期字段
     * @param {Object} rawTab - 原始标签页数据对象
     */
    function wakeTabFields(rawTab) {
        // 转换主要的日期字段
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

    const currentPanelId = orca.state.activePanel;
    let isWorkspace = false
    if (tabType === "workspace") {
        tabType = "recently-closed"
        isWorkspace = true
    }
    
    switch (tabType) {
        case "recently-closed": {
            for (const rawTab of rawTabArray) {

                if(!isWorkspace) rawTab.panelId = currentPanelId;

                // 转换 backStack，只处理日志视图，block视图不用处理
                for (const item of rawTab.backStack) {
                    if (item.view === "journal") item.viewArgs.date = new Date(item.viewArgs.date)
                }

                // 转换 forwardStack，只处理日志视图，block视图不用处理
                for (const item of rawTab.forwardStack) {
                    if (item.view === "journal") item.viewArgs.date = new Date(item.viewArgs.date)
                }
                // 解析日期字段
                wakeTabFields(rawTab);
            }
            break;
        }

        case "favorite": {
            for (const rawTab of rawTabArray) {
                rawTab.panelId = currentPanelId;
                // 解析日期字段
                wakeTabFields(rawTab);
            }
            break;
        }

        case "pinned": {
            for (const rawTab of rawTabArray) {
                rawTab.panelId = currentPanelId;
                // 解析日期字段
                wakeTabFields(rawTab);
            }
            break;
        }
    }
    return rawTabArray;
}


/**
 * 获取指定类型的标签页数组
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型
 * @returns {Array} 对应类型的标签页数组
 */
function getTabArray(tabType) {
    switch (tabType) {
        case "pinned":
            return pinnedTabArray;
        case "recently-closed":
            return recentlyClosedTabArray;
        default:
            return [];
    }
}


/**
 * 初始化时恢复标签页到模块内存对象
 * @param {Array} rawTabArray - 从json字符串解析出来的原始标签页数据数组（日期字段为字符串格式）
 * @param {'pinned'|'recently-closed'} tabType - 标签页类型
 * @returns {Promise<Array>} 返回恢复的标签页数组
 */
async function restoreTabs(rawTabArray, tabType) {
    if (!Array.isArray(rawTabArray) || rawTabArray.length === 0) return [];

    // 唤醒标签页数据
    const tabArray = wakeTabArray(rawTabArray, tabType);

    switch (tabType) {
        case "pinned":
            // 持久化数据载入到模块内存对象
            pinnedTabArray = tabArray;
            // 导入进core数据结构
            TabsmanCore.importTabToActivePanel(pinnedTabArray);
            return pinnedTabArray;
        case "recently-closed":
            recentlyClosedTabArray = tabArray;
            return recentlyClosedTabArray;
    }
}


/**
 * 恢复收藏块到全局数组
 * @param {Array} rawFavoriteBlocksArray - 从json字符串解析出来的原始收藏块对象数组
 * @returns {Array} 恢复后的收藏块数组
 */
function restoreFavoriteBlocks(rawFavoriteBlocksArray) {
    if (!Array.isArray(rawFavoriteBlocksArray) || rawFavoriteBlocksArray.length === 0) return [];
    for (const block of rawFavoriteBlocksArray) {
        if (typeof block.id === 'string') {
            block.id = new Date(block.id);
        }
    }
    favoriteBlockArray = rawFavoriteBlocksArray;
    return favoriteBlockArray;
}


/**
 * 获取收藏块数组
 * @returns {Array} 收藏块数组
 */
function getFavoriteBlockArray() {
    return favoriteBlockArray;
}


export {
    addAndSaveTab,
    removeAndSaveTab,
    restoreTabs,
    getTabArray,
    addAndSaveFavoriteBlock,
    removeAndSaveFavoriteBlock,
    restoreFavoriteBlocks,
    getFavoriteBlockArray,
    wakeTabArray
};