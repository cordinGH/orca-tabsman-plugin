/**
 * Tabsman 置顶标签页持久化模块
 * 负责置顶标签页数据的保存和恢复
 */

/** @type {Array} 全局pinTab元数据数组，[持久化存储]所有置顶标签页的元数据 */
let pinnedTabData = [];

/**
 * 添加置顶标签页数据到全局数组
 * @param {Object} tab - 标签页对象
 */
function addPinnedTabData(tab) {
    // 验证tab对象
    if (!tab || !tab.isPinned) return;
    
    // 直接添加到数组末尾
    pinnedTabData.push({
        tabId: tab.id,
        name: tab.name,
        createdAt: tab.createdAt,
        currentBlockId: tab.currentBlockId,
        currentIcon: tab.currentIcon,
        pinnedAt: tab.pinnedAt,
        backStack: tab.backStack,
        forwardStack: tab.forwardStack
    });
    
    // 将变更写入orca库文件
    savePinnedTabsData();
}

/**
 * 从全局数组中移除置顶标签页数据
 * @param {string} tabId - 标签页ID
 */
function removePinnedTabData(tabId) {
    // 直接查找并移除
    const index = pinnedTabData.findIndex(item => item.tabId === tabId);
    if (index !== -1) {
        pinnedTabData.splice(index, 1);
        
        // 将变更写入orca库文件
        savePinnedTabsData();
    }
}

/**
 * 保存置顶标签页数据到存储
 */
async function savePinnedTabsData() {
    try {
        await orca.plugins.setData('tabsman', 'pinned-tabs-data', JSON.stringify(pinnedTabData));
        console.log(`已保存 ${pinnedTabData.length} 个置顶标签页`);
    } catch (error) {
        console.error('保存置顶标签页失败:', error);
    }
}

/**
 * 恢复置顶标签页
 * @param {Array} pinnedTabsData - 持久化的pinTab数组
 * @param {Object} tabs - 标签页对象集合
 * @param {Map} tabIdSetByPanelId - 按面板分组的标签页ID集合
 * @returns {Promise<void>}
 */
async function restorePinnedTabs(pinnedTabsData, tabs, tabIdSetByPanelId) {
    if (!pinnedTabsData || pinnedTabsData.length === 0) {
        console.log('没有需要恢复的置顶标签页');
        return;
    }
    
    const currentPanelId = orca.state.activePanel;
    console.log(`开始恢复 ${pinnedTabsData.length} 个置顶标签页到面板 ${currentPanelId}`);
    
    for (let i = 0; i < pinnedTabsData.length; i++) {
        const tabData = pinnedTabsData[i];
        
        // 直接使用保存的tabId重建Tab对象
        const rebuiltTab = {
            id: tabData.tabId,
            panelId: currentPanelId,
            name: tabData.name,
            createdAt: tabData.createdAt,
            lastAccessed: new Date(),
            isActive: false,
            currentBlockId: tabData.currentBlockId,
            currentIcon: tabData.currentIcon,
            isPinned: true,
            pinnedAt: tabData.pinnedAt || new Date(),
            pinOrder: i + 1,
            backStack: tabData.backStack || [],
            forwardStack: tabData.forwardStack || []
        };
        
        // 注册到现有系统
        tabs[rebuiltTab.id] = rebuiltTab;
        
        if (!tabIdSetByPanelId.has(currentPanelId)) {
            tabIdSetByPanelId.set(currentPanelId, new Set());
        }
        tabIdSetByPanelId.get(currentPanelId).add(rebuiltTab.id);
        
        // 添加到全局pinTab数据数组
        pinnedTabData.push({
            tabId: rebuiltTab.id,
            name: tabData.name,
            createdAt: tabData.createdAt,
            currentBlockId: tabData.currentBlockId,
            currentIcon: tabData.currentIcon,
            pinnedAt: tabData.pinnedAt,
            backStack: tabData.backStack,
            forwardStack: tabData.forwardStack
        });
        
        console.log(`已恢复置顶标签页: ${rebuiltTab.name} (ID: ${rebuiltTab.id})`);
    }
    
    console.log(`置顶标签页恢复完成，共恢复 ${pinnedTabsData.length} 个标签页`);
}

export {
    addPinnedTabData,
    removePinnedTabData,
    restorePinnedTabs
};