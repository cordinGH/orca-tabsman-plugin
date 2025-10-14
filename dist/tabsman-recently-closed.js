const { createElement } = window.React;
const { Button, HoverContextMenu, Menu, MenuText } = orca.components;

// 导入核心模块
import { getAllTabs, getTabIdSetByPanelId, updateSortedTabsCache } from './tabsman-core.js';


// 导入持久化模块
import { setRecentlyClosedTabsCallback, restoreTabs, removeAndSaveTabData } from './tabsman-persistence.js';

let recentlyClosedTabs = [];

// 设置最近关闭标签页数据更新回调
setRecentlyClosedTabsCallback((newRecentlyClosedTabs) => {
    // 直接赋值最新的最近关闭标签页数据
    recentlyClosedTabs.length = 0; // 清空数组
    recentlyClosedTabs.push(...newRecentlyClosedTabs); // 添加新数据
});

// 导出recentlyClosedTabs数组，供其他模块使用
export { recentlyClosedTabs };

/**
 * 停止最近关闭标签页模块
 * @returns {Promise<void>} 返回Promise
 */
async function stopRecentlyClosed() {
    // 注销顶部栏按钮
    orca.headbar.unregisterHeadbarButton('tabsman.recently-closed');
    
    console.log('最近关闭标签页模块已停止');
}

/**
 * 启动最近关闭标签页模块
 * @param {Function} renderTabsByPanel - UI渲染函数
 * @returns {Promise<void>} 返回Promise
 */
async function startRecentlyClosed(renderTabsByPanel) {
    // 加载最近关闭的标签页数据
    try {
        const recentlyClosedTabsData = await orca.plugins.getData('tabsman', 'recently-closed-tabs-data');
        if (recentlyClosedTabsData) {
            // 使用持久化模块的restoreTabs函数来加载数据
            // restoreTabs会通过回调自动更新recentlyClosedTabs数组
            await restoreTabs(JSON.parse(recentlyClosedTabsData), "recently-closed");
        }
    } catch (error) {
        console.warn('加载最近关闭标签页数据失败:', error);
    }
    
    // 注册顶部栏按钮
    orca.headbar.registerHeadbarButton("tabsman.recently-closed", () =>
    createElement(HoverContextMenu, {
        menu: (close) => (
            recentlyClosedTabs.length === 0 ?
                createElement("div", {
                    className: 'plugin-tabsman-empty-state',
                    style: { padding: '10px', textAlign: 'center', color: '#666' }
                }, "暂无最近关闭的标签页") :
                createElement(Menu, {},
                    recentlyClosedTabs.map(tab =>
                        createElement(MenuText, {
                            key: tab.id,
                            title: tab.name,
                            preIcon: tab.currentIcon || 'ti ti-cube',
                            className: 'plugin-tabsman-recently-closed-tab-item',
                            style: {
                                fontFamily: 'var(--orca-fontfamily-code)',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '20em'
                            },
                            onClick: async () => {
                                // 恢复关闭的标签页到core的数据结构里
                                const currentPanelId = orca.state.activePanel;
                                
                                // 更新标签页的面板ID
                                tab.panelId = currentPanelId;
                                
                                // 直接注入到核心数据结构
                                // 判断 tab.id 是否已经存在于核心数据结构，如果已存在则弹通知并返回
                                if (getAllTabs()[tab.id]) {
                                    orca.notify("warn", "该标签页已被恢复");
                                    return;
                                }
                                getAllTabs()[tab.id] = tab;
                                
                                // 确保面板ID集合存在并添加标签页
                                if (!getTabIdSetByPanelId().has(currentPanelId)) {
                                    getTabIdSetByPanelId().set(currentPanelId, new Set());
                                }
                                getTabIdSetByPanelId().get(currentPanelId).add(tab.id);
                                
                                // 更新排序缓存，并刷新左侧栏渲染
                                updateSortedTabsCache(currentPanelId);
                                renderTabsByPanel();
                                
                                // 从最近关闭标签页数组中移除已恢复的标签页
                                const index = recentlyClosedTabs.findIndex(t => t.id === tab.id);
                                if (index !== -1) {
                                    recentlyClosedTabs.splice(index, 1);
                                    await removeAndSaveTabData(tab.id, "recently-closed");
                                }
                            }
                        })
                    )
                )
        )
    }, createElement(Button, {
        variant: "plain"
    }, [
        createElement("i", {
            className: "ti ti-stack-pop orca-headbar-icon",
        })
    ]))
    );
    
    console.log('最近关闭标签页模块启动完成');
}

// 导出启动和停止函数
export { startRecentlyClosed, stopRecentlyClosed };