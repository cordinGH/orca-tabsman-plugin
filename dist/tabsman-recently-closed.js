const { createElement } = window.React;
const { Button, HoverContextMenu, ContextMenu, Menu, MenuText } = orca.components;

// 导入核心模块
import * as TabsmanCore from './tabsman-core.js';

// 导入持久化模块
import * as TabsmanPersistence from './tabsman-persistence.js';


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

    // 加载最近关闭和收藏块的数据
    try {
        const jsonClosedTabsData = await orca.plugins.getData('tabsman', 'recently-closed-tabs-data');
        // 使用持久化模块的restoreTabs函数来恢复标签页对象数组
        if (jsonClosedTabsData) await TabsmanPersistence.restoreTabs(JSON.parse(jsonClosedTabsData), "recently-closed");
    } catch (error) {console.warn('加载最近关闭或收藏块数据失败:', error);}

    
    // 注册顶部栏按钮
    orca.headbar.registerHeadbarButton("tabsman.recently-closed", () => createElement(
        ContextMenu,
        {
            children: (open) => createElement(
                Button, {variant: "plain", onClick: open},
                createElement("i", {className: "ti ti-stack-pop orca-headbar-icon"})
            ),
            menu: (close) => [
                // 收藏的块列表
                createElement(MenuText,
                    { title: "收藏的块列表",preIcon: "ti ti-star" },
                    createElement(Menu, {}, TabsmanPersistence.getFavoriteBlockArray().length === 0 ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center' } }, "暂无收藏的块列表") :
                        TabsmanPersistence.getFavoriteBlockArray().map(block =>
                            createElement(MenuText, {
                                key: block.id,
                                preIcon: block.icon || 'ti ti-cube',
                                className: 'plugin-tabsman-favorite-block-item',
                                style: {cursor: 'default'},
                                title: createElement("div",
                                    {style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }},
                                    [createElement("span",
                                        { style: {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em', flex: 1}},
                                        block.title),
                                    createElement("i", {
                                        className: "ti ti-x plugin-tabsman-delete-btn", style: {cursor: 'pointer', opacity: 0.6, marginLeft: '8px', flexShrink: 0},
                                        onClick: async (e) => {
                                            e.stopPropagation();
                                            if (TabsmanPersistence.getFavoriteBlockArray().findIndex(item => item.id === block.id) === -1) {
                                                orca.notify("warn", "已经删除成功，无需再次删除");
                                                return;
                                            }
                                            await TabsmanPersistence.removeAndSaveFavoriteBlock(block.id);
                                            // 重新渲染侧边栏样式
                                            renderTabsByPanel();
                                        }
                                    })]
                                ),
                                onClick: async () => {
                                    // 恢复收藏的块到core的数据结构里
                                    const currentPanelId = orca.state.activePanel;
                                    await TabsmanCore.createTab(block.id, false, currentPanelId);
                                }
                            })
                        )
                    )
                ),
                createElement(MenuText,
                    { title: "关闭的标签页", preIcon: "ti ti-progress-x" },
                    createElement(Menu, {}, TabsmanPersistence.getTabArray("recently-closed").length === 0 ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center' } }, "暂无关闭的标签页") :
                        TabsmanPersistence.getTabArray("recently-closed").map(tab =>
                            createElement(MenuText, {
                                key: tab.id,
                                preIcon: tab.currentIcon || 'ti ti-cube',
                                className: 'plugin-tabsman-recently-closed-tab-item',
                                style: {cursor: 'default'},
                                title: createElement("div",
                                    {style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',width: '100%'}},
                                    [createElement("span", 
                                        {style: { fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em', flex: 1 }},
                                        tab.name),
                                    createElement("i", {
                                        className: "ti ti-x plugin-tabsman-delete-btn",
                                        style: {cursor: 'pointer', opacity: 0.6, marginLeft: '8px', flexShrink: 0},
                                        onClick: async (e) => {
                                            e.stopPropagation();
                                            if (TabsmanPersistence.getTabArray("recently-closed").findIndex(item => item.id === tab.id) === -1) {
                                                orca.notify("warn", "已经删除成功，无需再次删除");
                                                return;
                                            }
                                            await TabsmanPersistence.removeAndSaveTab(tab.id, "recently-closed");
                                        }
                                    })]
                                ),
                                onClick: async () => {
                                    // 恢复关闭的标签页到core的数据结构里
                                    const currentPanelId = orca.state.activePanel;
                                    
                                    // 判断 tab.id 是否已经存在于core数据结构，如果已存在则弹通知并返回
                                    if (TabsmanCore.getAllTabs()[tab.id]) {
                                        orca.notify("warn", "该标签页已被恢复");
                                        return;
                                    }
                                    
                                    // 创建 tab 对象的副本，避免引用持久化数据
                                    const tabCopy = { ...tab };
                                    tabCopy.panelId = currentPanelId;
                                    
                                    // 注册到core数据结构
                                    TabsmanCore.getAllTabs()[tab.id] = tabCopy;
                                    TabsmanCore.getTabIdSetByPanelId().get(currentPanelId).add(tab.id);
                                    // 更新排序缓存，并刷新左侧栏渲染
                                    TabsmanCore.updateSortedTabsCache(currentPanelId);
                                    renderTabsByPanel();
                                    
                                    // 从持久化数据中移除（会自动更新数组引用）
                                    await TabsmanPersistence.removeAndSaveTab(tab.id, "recently-closed");
                                }
                            })
                        )
                    )
                )
            ]
        }
    ));
    
    console.log('最近关闭标签页模块启动完成');
}

// 导出启动和停止函数
export { startRecentlyClosed, stopRecentlyClosed };
