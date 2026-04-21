const { createElement, useState } = window.React;
const { Button, HoverContextMenu, ContextMenu, Menu, MenuText } = orca.components;

import * as TabsmanCore from './tabsman-core.js';
import * as TabsmanPersistence from './tabsman-persistence.js';

let renderTabsByPanelCallback;

function stopRecentlyClosed() {
    orca.headbar.unregisterHeadbarButton('tabsman.recently-closed');
    renderTabsByPanelCallback = null;
}

function RecentlyClosedMenu({ close }) {
    const [favoriteList, setFavoriteList] = useState(() => TabsmanPersistence.getTabArray("favorite"));
    const [closedList, setClosedList] = useState(() => TabsmanPersistence.getTabArray("recently-closed"));

    return [
        createElement(MenuText,
            { key: "fav", title: "收藏的标签页", preIcon: "ti ti-star" },
            createElement(Menu, {},
                favoriteList.length === 0
                ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center', color: 'var(--orca-color-gray-5)' } }, "暂无收藏的标签页")
                : favoriteList.map(tab => {
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
                                key: "del",
                                className: "ti ti-x plugin-tabsman-delete-btn",
                                style: {cursor: 'pointer', opacity: 0.6, marginLeft: '8px', flexShrink: 0},
                                onClick: async (e) => {
                                    e.stopPropagation();
                                    const current = TabsmanPersistence.getTabArray("favorite");
                                    const exists = current.find(t => t.currentBlockId.toString() === blockId.toString());
                                    if (!exists) {
                                        orca.notify("warn", "已经删除成功，无需再次删除");
                                        return;
                                    }
                                    await TabsmanPersistence.removeAndSaveTab(tab, "favorite");
                                    setFavoriteList([...TabsmanPersistence.getTabArray("favorite")]);
                                    // 同步刷新侧边栏收藏图标
                                    renderTabsByPanelCallback && renderTabsByPanelCallback();
                                }
                            })]
                        ),
                        onClick: async () => {
                            const currentPanelId = orca.state.activePanel;
                            const {view, viewArgs} = tab.backStack.at(-1);
                            const newTab = await TabsmanCore.createTab({ currentBlockId: blockId, panelId: currentPanelId, initHistoryInfo: { view, viewArgs }});
                            await TabsmanCore.switchTab(newTab.id)
                        }
                    });
                })
            )
        ),
        createElement(MenuText,
            { key: "closed", title: "最近关闭的标签页", preIcon: "ti ti-progress-x" },
            createElement(Menu, {},
                closedList.length === 0
                ? createElement("div", { className: 'plugin-tabsman-empty-state', style: { textAlign: 'center', color: 'var(--orca-color-gray-5)' } }, "暂无关闭的标签页")
                : closedList.map(tab =>
                    createElement(MenuText, {
                        key: tab.id,
                        preIcon: tab.currentIcon || 'ti ti-cube',
                        className: 'plugin-tabsman-recently-closed-tab-item',
                        style: {cursor: 'default'},
                        title: createElement("div",
                            {style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}},
                            [createElement("span",
                                {style: { fontFamily: 'var(--orca-fontfamily-code)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '20em', flex: 1 }},
                                tab.name),
                            createElement("i", {
                                key: "del",
                                className: "ti ti-x plugin-tabsman-delete-btn",
                                style: {cursor: 'pointer', opacity: 0.6, marginLeft: '8px', flexShrink: 0},
                                onClick: async (e) => {
                                    e.stopPropagation();
                                    const current = TabsmanPersistence.getTabArray("recently-closed");
                                    if (current.findIndex(item => item.id === tab.id) === -1) {
                                        orca.notify("warn", "已经删除成功，无需再次删除");
                                        return;
                                    }
                                    await TabsmanPersistence.removeAndSaveTab(tab, "recently-closed");
                                    setClosedList([...TabsmanPersistence.getTabArray("recently-closed")]);
                                }
                            })]
                        ),
                        onClick: async () => {
                            if (TabsmanCore.getTab(tab.id)) {
                                orca.notify("warn", "该标签页已被恢复");
                                return;
                            }
                            const currentPanelId = orca.state.activePanel;
                            const {view, viewArgs} = tab.backStack.at(-1);
                            const newTab = await TabsmanCore.createTab({ currentBlockId: tab.currentBlockId, panelId: currentPanelId, initHistoryInfo: { view, viewArgs }});
                            await TabsmanCore.switchTab(newTab.id)
                            await TabsmanPersistence.removeAndSaveTab(tab, "recently-closed");
                            setClosedList([...TabsmanPersistence.getTabArray("recently-closed")]);
                        }
                    })
                )
            )
        )
    ];
}

function startRecentlyClosed(renderTabsByPanel) {
    // 暴露给收藏删除时调用
    renderTabsByPanelCallback = renderTabsByPanel

    orca.headbar.registerHeadbarButton("tabsman.recently-closed", () => createElement(
        ContextMenu,
        {
            children: (open) => createElement(
                Button, {variant: "plugin-tabsman-fav-and-closed plain", onClick: open},
                createElement("i", {className: "ti ti-stack-pop orca-headbar-icon"})
            ),
            menu: (close) => createElement(RecentlyClosedMenu, { close })
        }
    ));
}

export { startRecentlyClosed, stopRecentlyClosed };