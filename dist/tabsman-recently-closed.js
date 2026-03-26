const { createElement } = window.React;
const { Button, HoverContextMenu, ContextMenu, Menu, MenuText } = orca.components;

// 导入核心模块
import * as TabsmanCore from './tabsman-core.js';

// 导入持久化模块
import * as TabsmanPersistence from './tabsman-persistence.js';



 // 停止最近关闭标签页模块
function stopRecentlyClosed() {
    // 注销顶部栏按钮
    orca.headbar.unregisterHeadbarButton('tabsman.recently-closed');
    console.log('最近关闭标签页模块已停止');
}

/**
 * 启动最近关闭标签页模块
 * @param {Function} renderTabsByPanel - UI渲染函数
 * @description 数据恢复已在 tabsman-core.js 的 start() 中统一完成
 */
function startRecentlyClosed(renderTabsByPanel) {
    // 注册顶部栏按钮
    orca.headbar.registerHeadbarButton("tabsman.recently-closed", () => createElement(
        ContextMenu,
        {
            children: (open) => createElement(
                Button, {variant: "plugin-tabsman-fav-and-closed plain", onClick: open},
                createElement("i", {className: "ti ti-stack-pop orca-headbar-icon"})
            ),
            menu: (close) => [
                // 收藏的块列表
                createElement(MenuText,
                    { title: "收藏的标签页",preIcon: "ti ti-star" },
                    createElement(Menu, {}, 
                        TabsmanPersistence.getTabArray("favorite").length === 0
                        ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center' } }, "暂无收藏的标签页")
                        : TabsmanPersistence.getTabArray("favorite").map(tab => {
                            const blockId = tab.currentBlockId;
                            return createElement(MenuText, {
                                key: blockId,
                                preIcon: tab.currentIcon || 'ti ti-cube',
                                className: 'plugin-tabsman-favorite-block-item',
                                style: {cursor: 'default'},
                                title: createElement("div",
                                    {style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }},
                                    [createElement("span",
                                        { style: {fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em', flex: 1}},
                                        tab.name),
                                    createElement("i", {
                                        className: "ti ti-x plugin-tabsman-delete-btn", style: {cursor: 'pointer', opacity: 0.6, marginLeft: '8px', flexShrink: 0},
                                        onClick: async (e) => {
                                            e.stopPropagation();
                                            const isAlreadyDeleted = TabsmanPersistence.getTabArray("favorite").find(tab => tab.currentBlockId.toString() === blockId.toString())
                                            if (!isAlreadyDeleted) {
                                                orca.notify("warn", "已经删除成功，无需再次删除");
                                                return;
                                            }
                                            await TabsmanPersistence.removeAndSaveTab(tab, "favorite");
                                            // 重新渲染侧边栏样式
                                            renderTabsByPanel();
                                        }
                                    })]
                                ),
                                onClick: async () => {
                                    // 恢复收藏的块到core的数据结构里
                                    const currentPanelId = orca.state.activePanel;
                                    const {view, viewArgs} = tab.backStack.at(-1);
                                    await TabsmanCore.createTab({ currentBlockId: blockId, panelId: currentPanelId, initHistoryInfo: { view, viewArgs }});
                                }
                            })
                        })
                    )
                ),
                createElement(MenuText,
                    { title: "最近关闭的标签页", preIcon: "ti ti-progress-x" },
                    createElement(Menu, {},
                        TabsmanPersistence.getTabArray("recently-closed").length === 0
                        ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center' } }, "暂无关闭的标签页")
                        : TabsmanPersistence.getTabArray("recently-closed").map(tab =>
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
                                    // 点击恢复关闭的标签页，重新导入到core的数据结构
                                    // 判断 tab.id 是否已经存在于core数据结构，如果已存在则弹通知并返回
                                    if (TabsmanCore.getTab(tab.id)) {
                                        orca.notify("warn", "该标签页已被恢复");
                                        return;
                                    }
                                    // 恢复到core的数据结构里
                                    const currentPanelId = orca.state.activePanel;
                                    const {view, viewArgs} = tab.backStack.at(-1);
                                    await TabsmanCore.createTab({ currentBlockId: tab.currentBlockId, panelId: currentPanelId, initHistoryInfo: { view, viewArgs }});
                                    await TabsmanPersistence.removeAndSaveTab(tab, "recently-closed");
                                }
                            })
                        )
                    )
                )
            ]
        }
    ));
}

// 导出启动和停止函数
export { startRecentlyClosed, stopRecentlyClosed };
